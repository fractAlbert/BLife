/**
 * Soup — holds the live population of LifeForms and the space they occupy.
 * See docs/Game-Plan.md §9/§10/§11/§15/§17/§18/§19.
 */
class Soup {
  // Soft carrying capacity: reproduction throttles and death rate rises as population
  // approaches this (see the crowding math in tick()). Starting guess, not tuned — §11.
  static CARRYING_CAPACITY = 300;

  // Per-tick chance of overcrowding death for an organism, at crowding == 1 (at capacity).
  // Scaled by crowding^2, so this is the death rate right at the carrying capacity, not below it.
  static OVERCROWD_DEATH_RATE = 0.02;

  // Hard backstop, not the intended regulation mechanism — reproduction is unconditionally
  // skipped past this regardless of the soft crowding rolls, so mistuned constants can't
  // reproduce their way back into the multi-gigabyte runaway already observed once. See §11.
  static MAX_POPULATION = 600;

  // Foraging/predation (§15). photosynthetic (passive-only) and parasite (deferred) are
  // deliberately absent from both sets.
  static NUTRIENT_EATER_DIETS = new Set(['detritivore', 'herbivore', 'omnivore', 'scavenger', 'filterFeeder']);
  static PREDATOR_DIETS = new Set(['predator', 'omnivore']);

  // Safety net, not the intended fix — see §15. Guarantees the soup can never end up
  // permanently empty with no in-game way to recover, even though testing found this
  // shouldn't normally be needed.
  static RESEED_COUNT = 10;

  static NUTRIENT_COUNT = 40;
  static NUTRIENT_RADIUS = 4;
  static NUTRIENT_ENERGY = 0.3;
  static NUTRIENT_RESPAWN_CHANCE = 0.1;
  static PREDATION_ENERGY_GAIN = 0.4;

  // Ticks a birth-effect ring lives before expiring (§18).
  static BIRTH_EFFECT_TICKS = 20;

  constructor(bounds, margin = 30) {
    this.bounds = bounds; // { width, height }, local coordinate space matching the background art
    this.margin = margin; // keep spawns off the frame edge
    this.entities = [];
    this.nutrients = [];
    this.birthEffects = []; // { x, y, tick } — ephemeral, purely visual (§18)
    this.tickCount = 0;

    for (let i = 0; i < Soup.NUTRIENT_COUNT; i++) {
      this.nutrients.push(this.randomNutrientPosition());
    }
  }

  // Living organisms only — corpses linger in `entities` while fading out (§18) but
  // shouldn't count as population for crowding, the reseed safety net, or display.
  get aliveCount() {
    return this.entities.reduce((count, entity) => count + (entity.isAlive ? 1 : 0), 0);
  }

  // Average per-bit Shannon entropy across the alive population's genomes, as a
  // percentage (§20) — 0% means every organism agrees on every bit, 100% means every
  // bit is split evenly. O(bitLength x aliveCount); call periodically; not every tick.
  calculateGeneticDiversity() {
    const alive = this.entities.filter((entity) => entity.isAlive);
    if (alive.length < 2) return 0;

    let totalEntropy = 0;
    for (let bit = 0; bit < Genome.BIT_LENGTH; bit++) {
      let onesCount = 0;
      for (const entity of alive) {
        if ((entity.genome.value >> BigInt(bit)) & 1n) onesCount++;
      }
      const p = onesCount / alive.length;
      if (p > 0 && p < 1) {
        totalEntropy += -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p));
      }
    }

    return (totalEntropy / Genome.BIT_LENGTH) * 100;
  }

  randomNutrientPosition() {
    return {
      x: this.margin + Math.random() * (this.bounds.width - this.margin * 2),
      y: this.margin + Math.random() * (this.bounds.height - this.margin * 2),
    };
  }

  spawnRandom(count) {
    for (let i = 0; i < count; i++) {
      const x = this.margin + Math.random() * (this.bounds.width - this.margin * 2);
      const y = this.margin + Math.random() * (this.bounds.height - this.margin * 2);
      this.entities.push(new LifeForm(Genome.random(), x, y));
    }
  }

  tick() {
    for (const entity of this.entities) {
      if (entity.isAlive) entity.update(this.bounds, this); // corpses don't move (§18)
    }

    this.forage();
    this.predate();

    const aliveCount = this.aliveCount;
    const crowding = aliveCount / Soup.CARRYING_CAPACITY;

    const offspring = [];

    // Sexual/either pairing runs first (§19) — an `either` organism that mates here
    // has its cooldown reset by recordReproduction(), so the asexual loop below
    // naturally skips it this same tick without needing an extra "already mated" flag.
    for (const pair of this.matePairs()) {
      if (aliveCount + offspring.length >= Soup.MAX_POPULATION) break;
      if (Math.random() < crowding) continue; // same crowding throttle as asexual, below
      offspring.push(new LifeForm(pair.hex, pair.x, pair.y));
      this.birthEffects.push({ x: pair.x, y: pair.y, tick: 0 });
    }

    for (const entity of this.entities) {
      if (aliveCount + offspring.length >= Soup.MAX_POPULATION) break;
      if (!entity.isAlive) continue;

      const childGenomeHex = entity.tryReproduce();
      if (!childGenomeHex) continue; // cooldown/proclivity check failed, nothing consumed beyond that

      // Attempt succeeded biologically but can still fail to crowding — the cooldown
      // above is already spent either way, so this is what makes reproduction feel
      // "slower," not just capped.
      if (Math.random() < crowding) continue;

      const spread = LifeForm.OFFSPRING_SPREAD;
      const x = this.clamp(entity.x + (Math.random() - 0.5) * spread, this.bounds.width);
      const y = this.clamp(entity.y + (Math.random() - 0.5) * spread, this.bounds.height);
      offspring.push(new LifeForm(childGenomeHex, x, y));
      this.birthEffects.push({ x, y, tick: 0 }); // spawn ring, §18
    }
    this.entities.push(...offspring);

    for (const entity of this.entities) {
      if (entity.isAlive && Math.random() < crowding * crowding * Soup.OVERCROWD_DEATH_RATE) {
        entity.die();
      }
    }

    // Death lifecycle (§18): newly-dead start fading (deathTick 0) instead of being
    // removed immediately; fading corpses advance; only once a corpse's fade completes
    // does it actually get removed/destroyed, leaving a nutrient behind.
    const surviving = [];
    for (const entity of this.entities) {
      if (entity.isAlive) {
        surviving.push(entity);
        continue;
      }

      if (entity.deathTick === null) {
        entity.state = 'dead';
        entity.deathTick = 0;
        surviving.push(entity);
        continue;
      }

      entity.deathTick += 1;
      if (entity.deathTick < LifeForm.FADE_TICKS) {
        surviving.push(entity);
        continue;
      }

      this.nutrients.push({ x: entity.x, y: entity.y });
      entity.destroy();
    }
    this.entities = surviving;

    // Birth effects (§18): grow/fade for BIRTH_EFFECT_TICKS, then expire.
    this.birthEffects = this.birthEffects
      .map((effect) => ({ ...effect, tick: effect.tick + 1 }))
      .filter((effect) => effect.tick < Soup.BIRTH_EFFECT_TICKS);

    if (this.aliveCount === 0) {
      this.spawnRandom(Soup.RESEED_COUNT);
    }

    this.tickCount += 1;
  }

  // Sexual/either pairing (§19). Eligibility (cooldown/energy/proclivity) is precomputed
  // once per organism via canAffordReproduction() and reused for every pairwise
  // comparison — re-invoking it per candidate would re-roll proclivity multiple times
  // for the same organism in one tick. Returns [{ hex, x, y }, ...] for Soup.tick() to
  // turn into actual LifeForms (kept as plain data here, not constructed directly, so
  // this method has no rendering/entity-construction concerns of its own).
  matePairs() {
    const seekers = this.entities.filter((entity) => (
      entity.isAlive
      && (entity.traits.reproductionType === 'sexual' || entity.traits.reproductionType === 'either')
      && entity.canAffordReproduction()
    ));

    const matedIds = new Set();
    const pairs = [];

    for (const a of seekers) {
      if (matedIds.has(a.id)) continue;

      let bestMate = null;
      let bestDistance = a.traits.senseRadius;
      for (const b of seekers) {
        if (b === a || matedIds.has(b.id)) continue;
        if (!Genome.areCompatible(a.genome.hex, b.genome.hex)) continue;

        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestMate = b;
        }
      }

      if (!bestMate) continue;
      if (bestDistance > a.displayRadius + bestMate.displayRadius) continue; // sensed, but not touching yet

      const hex = Genome.mutate(Genome.crossover(a.genome.hex, bestMate.genome.hex), LifeForm.MUTATION_RATE);
      a.recordReproduction();
      bestMate.recordReproduction();
      matedIds.add(a.id);
      matedIds.add(bestMate.id);

      pairs.push({
        hex,
        x: (a.x + bestMate.x) / 2,
        y: (a.y + bestMate.y) / 2,
      });
    }

    return pairs;
  }

  // Nutrient-eater diets (§15) consume nearby particles for bonus energy, at most one
  // per organism per tick. Depleted particles regenerate at a bounded rate, not instantly.
  forage() {
    for (const entity of this.entities) {
      if (!entity.isAlive) continue;
      if (!Soup.NUTRIENT_EATER_DIETS.has(entity.traits.dietType)) continue;

      for (let i = this.nutrients.length - 1; i >= 0; i--) {
        const nutrient = this.nutrients[i];
        const dx = entity.x - nutrient.x;
        const dy = entity.y - nutrient.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance <= entity.displayRadius + Soup.NUTRIENT_RADIUS) {
          entity.feed(Soup.NUTRIENT_ENERGY);
          this.nutrients.splice(i, 1);
          break; // one nutrient per organism per tick
        }
      }
    }

    if (this.nutrients.length < Soup.NUTRIENT_COUNT && Math.random() < Soup.NUTRIENT_RESPAWN_CHANCE) {
      this.nutrients.push(this.randomNutrientPosition());
    }
  }

  // Predator-diet organisms (§15) consume a smaller, nearby organism for bonus energy —
  // any diet is fair game, purely size-based (see §15's food-web simplification note).
  // At most one meal per predator per tick; eatenIds prevents double-claiming prey.
  predate() {
    const eatenIds = new Set();

    for (const predator of this.entities) {
      if (!predator.isAlive || eatenIds.has(predator.id)) continue;
      if (!Soup.PREDATOR_DIETS.has(predator.traits.dietType)) continue;

      for (const prey of this.entities) {
        if (prey === predator || !prey.isAlive || eatenIds.has(prey.id)) continue;
        if (prey.displayRadius >= predator.displayRadius) continue;

        const dx = predator.x - prey.x;
        const dy = predator.y - prey.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance <= predator.displayRadius + prey.displayRadius) {
          predator.feed(Soup.PREDATION_ENERGY_GAIN);
          prey.die();
          eatenIds.add(prey.id);
          break; // one meal per predator per tick
        }
      }
    }
  }

  clamp(value, max) {
    return Math.max(this.margin, Math.min(max - this.margin, value));
  }

  findEntityAt(x, y) {
    let closest = null;
    let closestDistance = Infinity;

    for (const entity of this.entities) {
      if (!entity.isAlive) continue; // corpses aren't selectable (§18)
      const dx = entity.x - x;
      const dy = entity.y - y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance <= entity.displayRadius && distance < closestDistance) {
        closest = entity;
        closestDistance = distance;
      }
    }

    return closest;
  }

  // Movement-pattern query helpers (§17). Additive — forage()/predate() keep their own
  // already-verified inline search loops rather than being refactored onto these.
  findNearestEntity(x, y, maxDistance, predicate) {
    let nearest = null;
    let nearestDistance = maxDistance;

    for (const entity of this.entities) {
      if (!predicate(entity)) continue;
      const dx = entity.x - x;
      const dy = entity.y - y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < nearestDistance) {
        nearest = entity;
        nearestDistance = distance;
      }
    }

    return nearest;
  }

  findNearestNutrient(x, y, maxDistance) {
    let nearest = null;
    let nearestDistance = maxDistance;

    for (const nutrient of this.nutrients) {
      const dx = nutrient.x - x;
      const dy = nutrient.y - y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < nearestDistance) {
        nearest = nutrient;
        nearestDistance = distance;
      }
    }

    return nearest;
  }

  findEntitiesWithin(x, y, maxDistance, predicate) {
    const results = [];
    for (const entity of this.entities) {
      if (!predicate(entity)) continue;
      const dx = entity.x - x;
      const dy = entity.y - y;
      if (Math.sqrt(dx * dx + dy * dy) <= maxDistance) results.push(entity);
    }
    return results;
  }

  destroy() {
    for (const entity of this.entities) {
      entity.destroy();
    }
    this.entities = [];
  }
}
