/**
 * Soup — holds the live population of LifeForms and the space they occupy.
 * See docs/Game-Plan.md §9/§10/§11/§15/§17/§18/§19/§26/§27/§28/§29.
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

  // Corpse-scavenging (§26) — a repeatable per-tick trickle, not a one-time meal.
  static SCAVENGE_DIETS = new Set(['scavenger', 'detritivore']);
  static SCAVENGE_ENERGY_RATE = 0.01;
  static SCAVENGE_DECAY_BOOST = 2; // on top of the normal +1 aging a fading corpse already gets

  // Parasitism (§27) — energy moved directly from host to parasite, not created.
  static PARASITE_DRAIN_RATE = 0.01;

  constructor(bounds, margin = 30) {
    this.bounds = bounds; // { width, height }, local coordinate space matching the background art
    this.margin = margin; // keep spawns off the frame edge
    this.entities = [];
    this.nutrients = [];
    this.birthEffects = []; // { x, y, tick } — ephemeral, purely visual (§18)
    this.tickCount = 0;
    // Entity-to-entity proximity queries only (§29) — nutrients stay a linear scan,
    // see docs. Rebuilt fresh once per tick in rebuildEntityGrid(), not maintained
    // incrementally as entities move.
    this.entityGrid = new SpatialGrid();

    this.seedNutrients();
  }

  // Factored out of the constructor (§31) so reinitialize() doesn't duplicate it.
  seedNutrients() {
    for (let i = 0; i < Soup.NUTRIENT_COUNT; i++) {
      this.nutrients.push(this.randomNutrientPosition());
    }
  }

  // §29: called once per tick, right after movement, before any proximity query reads
  // it. Indexes every entity — living organisms and fading corpses alike — since
  // predation/scavenging both need to find corpses/prey among "other entities."
  rebuildEntityGrid() {
    this.entityGrid.clear();
    for (const entity of this.entities) {
      this.entityGrid.insert(entity, entity.x, entity.y);
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
        if ((entity.expressedGenome.value >> BigInt(bit)) & 1n) onesCount++;
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
      this.entities.push(new LifeForm(Genome.random(), Genome.random(), x, y));
    }
  }

  // §31: a snapshot of the current living population's genomes and positions, so
  // reinitialize() can later rewind back to exactly this starting point (Reset),
  // rather than generating a new random one (New Soup). Deliberately not full
  // save-state — no age/energy/traits, just enough to reconstruct fresh LifeForms
  // identical to how this population started out.
  captureSeed() {
    return this.entities
      .filter((entity) => entity.isAlive)
      .map((entity) => ({
        hexA: entity.genomeA.hex, hexB: entity.genomeB.hex, x: entity.x, y: entity.y,
      }));
  }

  // §31: shared wipe-and-respawn logic for New Soup / Reset. Pass `seed` (from
  // captureSeed()) to rewind to that exact starting population, or omit it and pass
  // `count` to spawn a brand-new random one instead.
  reinitialize(seed = null, count = 0) {
    for (const entity of this.entities) {
      entity.destroy();
    }
    this.entities = [];
    this.nutrients = [];
    this.birthEffects = [];
    this.entityGrid.clear();
    this.tickCount = 0;

    this.seedNutrients();

    if (seed) {
      for (const { hexA, hexB, x, y } of seed) {
        this.entities.push(new LifeForm(hexA, hexB, x, y));
      }
    } else {
      this.spawnRandom(count);
    }
  }

  tick() {
    // §29: movement steering (seekMate/flee/schooling/ambush, §17) queries the grid
    // via findNearestEntity()/findEntitiesWithin() from inside entity.update() below,
    // so it needs to already reflect positions as of the start of this tick before the
    // movement loop runs.
    this.rebuildEntityGrid();

    for (const entity of this.entities) {
      if (entity.isAlive) entity.update(this.bounds, this); // corpses don't move (§18)
    }

    // Rebuilt again now that movement has actually changed positions — predate/
    // scavenge/parasitize/matePairs below all need current, not pre-movement, contact
    // distances.
    this.rebuildEntityGrid();

    this.forage();
    this.predate();
    this.scavenge();
    this.parasitize();

    const aliveCount = this.aliveCount;
    const crowding = aliveCount / Soup.CARRYING_CAPACITY;

    const offspring = [];

    // Sexual/either pairing runs first (§19) — an `either` organism that mates here
    // has its cooldown reset by recordReproduction(), so the asexual loop below
    // naturally skips it this same tick without needing an extra "already mated" flag.
    for (const pair of this.matePairs()) {
      if (aliveCount + offspring.length >= Soup.MAX_POPULATION) break;
      if (Math.random() < crowding) continue; // same crowding throttle as asexual, below
      offspring.push(new LifeForm(pair.hexA, pair.hexB, pair.x, pair.y));
      this.birthEffects.push({ x: pair.x, y: pair.y, tick: 0 });
    }

    for (const entity of this.entities) {
      if (aliveCount + offspring.length >= Soup.MAX_POPULATION) break;
      if (!entity.isAlive) continue;

      const childGenomes = entity.tryReproduce();
      if (!childGenomes) continue; // cooldown/proclivity check failed, nothing consumed beyond that

      // Attempt succeeded biologically but can still fail to crowding — the cooldown
      // above is already spent either way, so this is what makes reproduction feel
      // "slower," not just capped.
      if (Math.random() < crowding) continue;

      const spread = LifeForm.OFFSPRING_SPREAD;
      const x = this.clamp(entity.x + (Math.random() - 0.5) * spread, this.bounds.width);
      const y = this.clamp(entity.y + (Math.random() - 0.5) * spread, this.bounds.height);
      offspring.push(new LifeForm(childGenomes.hexA, childGenomes.hexB, x, y));
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
  // for the same organism in one tick. Compatibility is judged on expressed traits
  // (§28), but each parent contributes one of its own two strands — chosen at random,
  // then mutated — rather than crossing over per-bit. Returns [{ hexA, hexB, x, y }, ...]
  // for Soup.tick() to turn into actual LifeForms (kept as plain data here, not
  // constructed directly, so this method has no rendering/entity-construction concerns
  // of its own).
  matePairs() {
    const seekers = this.entities.filter((entity) => (
      entity.isAlive
      && (entity.traits.reproductionType === 'sexual' || entity.traits.reproductionType === 'either')
      && entity.canAffordReproduction()
    ));
    // §29: O(1) membership test below, so grid candidates outside `seekers` are
    // rejected without re-invoking canAffordReproduction() per pairwise comparison.
    const seekerSet = new Set(seekers);

    const matedIds = new Set();
    const pairs = [];

    for (const a of seekers) {
      if (matedIds.has(a.id)) continue;

      let bestMate = null;
      let bestDistance = a.traits.senseRadius;
      const candidates = this.entityGrid.queryRadius(a.x, a.y, a.traits.senseRadius);
      for (const b of candidates) {
        if (b === a || matedIds.has(b.id) || !seekerSet.has(b)) continue;
        if (!Genome.areCompatible(a.expressedGenome.hex, b.expressedGenome.hex)) continue;

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

      const aStrand = Math.random() < 0.5 ? a.genomeA : a.genomeB;
      const bStrand = Math.random() < 0.5 ? bestMate.genomeA : bestMate.genomeB;
      const hexA = Genome.mutate(aStrand.hex, LifeForm.MUTATION_RATE);
      const hexB = Genome.mutate(bStrand.hex, LifeForm.MUTATION_RATE);
      a.recordReproduction();
      bestMate.recordReproduction();
      matedIds.add(a.id);
      matedIds.add(bestMate.id);

      pairs.push({
        hexA,
        hexB,
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
  // any diet is fair game, purely size-based (see §15's food-web simplification note),
  // except an organism's own kind — no cannibalism (§30). At most one meal per predator
  // per tick; eatenIds prevents double-claiming prey.
  predate() {
    const eatenIds = new Set();

    for (const predator of this.entities) {
      if (!predator.isAlive || eatenIds.has(predator.id)) continue;
      if (!Soup.PREDATOR_DIETS.has(predator.traits.dietType)) continue;

      // §29: prey's own displayRadius isn't known until we've found it, so query with
      // the largest possible contact distance (predator's radius + the biggest any
      // organism can ever be) — same candidate set the old this.entities scan would
      // have produced, just pre-filtered by cell instead of checked one by one.
      const candidates = this.entityGrid.queryRadius(
        predator.x, predator.y, predator.displayRadius + LifeForm.MAX_DISPLAY_RADIUS,
      );

      for (const prey of candidates) {
        if (prey === predator || !prey.isAlive || eatenIds.has(prey.id)) continue;
        if (prey.displayRadius >= predator.displayRadius) continue;
        // §30: "you can't eat something you could have mated with" — reuses the same
        // compatibility check §11/§17/§19 use for mate-finding, rather than a second,
        // parallel notion of "same species."
        if (Genome.areCompatible(predator.expressedGenome.hex, prey.expressedGenome.hex)) continue;

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

  // scavenger/detritivore diets (§26) feed directly on a touching fading corpse,
  // accelerating its decomposition on top of the normal +1/tick aging. Not capped to
  // one scavenger per corpse — multiple can feed on the same one simultaneously.
  scavenge() {
    for (const scavenger of this.entities) {
      if (!scavenger.isAlive) continue;
      if (!Soup.SCAVENGE_DIETS.has(scavenger.traits.dietType)) continue;

      const candidates = this.entityGrid.queryRadius(
        scavenger.x, scavenger.y, scavenger.displayRadius + LifeForm.MAX_DISPLAY_RADIUS,
      );

      for (const corpse of candidates) {
        if (corpse === scavenger || corpse.deathTick === null) continue;

        const dx = scavenger.x - corpse.x;
        const dy = scavenger.y - corpse.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance <= scavenger.displayRadius + corpse.displayRadius) {
          scavenger.feed(Soup.SCAVENGE_ENERGY_RATE);
          corpse.deathTick += Soup.SCAVENGE_DECAY_BOOST;
          break; // one corpse scavenged per organism per tick
        }
      }
    }
  }

  // parasite diet (§27): drains energy from a touching, eligible living host every
  // tick rather than a one-time kill (predation) or a static resource (foraging).
  // No persistent "attached to X" state — re-checks for any eligible host each tick.
  parasitize() {
    for (const parasite of this.entities) {
      if (!parasite.isAlive) continue;
      if (parasite.traits.dietType !== 'parasite') continue;

      const candidates = this.entityGrid.queryRadius(
        parasite.x, parasite.y, parasite.displayRadius + LifeForm.MAX_DISPLAY_RADIUS,
      );

      for (const host of candidates) {
        if (host === parasite || !host.isAlive) continue;
        if (host.traits.dietType === 'parasite') continue; // no hyperparasitism in v1
        if (host.displayRadius < parasite.displayRadius) continue;

        const dx = parasite.x - host.x;
        const dy = parasite.y - host.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance <= parasite.displayRadius + host.displayRadius) {
          const drained = Math.min(Soup.PARASITE_DRAIN_RATE, host.energy);
          host.energy -= drained;
          parasite.feed(drained);
          break; // one host per parasite per tick
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
  // §29: queries the grid instead of scanning every entity — maxDistance is exactly
  // the radius callers already wanted checked, so no extra padding is needed here
  // (unlike predate()/scavenge()/parasitize(), which don't know the other side's
  // radius up front).
  findNearestEntity(x, y, maxDistance, predicate) {
    let nearest = null;
    let nearestDistance = maxDistance;

    const candidates = this.entityGrid.queryRadius(x, y, maxDistance);
    for (const entity of candidates) {
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
    const candidates = this.entityGrid.queryRadius(x, y, maxDistance);
    for (const entity of candidates) {
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
