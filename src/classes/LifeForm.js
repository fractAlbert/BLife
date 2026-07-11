/**
 * LifeForm — an organism living in the soup: two Genomes (diploid, §28) plus runtime
 * state. See docs/Game-Plan.md §9/§10/§11/§14/§15/§17/§18/§19/§22/§26/§27/§28.
 * Movement (all 8 movementPattern values, §17), aging + growth toward adult size
 * (§22), lifespan/overcrowding/starvation/predation death (with a fade out +
 * decomposition into a nutrient, §18), asexual and sexual reproduction (with a
 * fade-in + spawn effect, §18/§19), and passive + foraging/predation/scavenging/
 * parasitism feeding are all wired up.
 */
class LifeForm {
  static nextId = 1;

  // Genome's `size` trait (4-40, §8) is a biology value, not a pixel count. This is the
  // renderer-level scale factor between the two — tune here, not in the gene map.
  static VISUAL_SCALE = 0.25;

  // Radians of random heading drift applied per tick for drift/fallback wander —
  // higher wanders more erratically.
  static WANDER = 0.15;

  // Same mechanism as WANDER but for the randomWalk pattern specifically (§17) —
  // larger, so it reads as more erratic than a gentle drift.
  static RANDOM_WALK_WANDER = 0.6;

  // Max radians/tick a steering organism (seekFood/flee/seekMate/schooling, §17) can
  // turn toward its target — keeps direction changes smooth instead of snapping.
  static STEER_RATE = 0.2;

  // ambush (§17): fraction of the trait's `speed` actually used — stays close to put
  // rather than chasing, relying on prey/mates wandering into range instead.
  static AMBUSH_SPEED_SCALE = 0.1;

  // Per-bit flip probability applied to a copied genome on asexual reproduction.
  static MUTATION_RATE = 0.03;

  // How far (in display pixels) offspring spawn from their parent.
  static OFFSPRING_SPREAD = 20;

  // Energy (0-1) every organism starts at, spawn or offspring alike (§14).
  static STARTING_ENERGY = 0.6;

  // Per-tick energy cost, multiplied by `size` — bigger organisms cost more (§14).
  static BASE_METABOLISM_RATE = 0.0002;

  // Passive per-tick energy gain for photosynthetic organisms (§14) — roughly
  // matches average metabolic cost, so they're close to self-sustaining.
  static PHOTOSYNTHETIC_REGEN_RATE = 0.005;

  // Passive per-tick energy gain for every other diet (§14) — an honest placeholder,
  // below average metabolic cost, until real foraging/predation exists for them.
  static OTHER_DIET_REGEN_RATE = 0.002;

  // Ticks a corpse spends fading out before actually being removed/decomposing into
  // a nutrient (§18) — slower than birth, decaying reads better gradual.
  static FADE_TICKS = 45;

  // Ticks a newborn spends fading in (§18) — faster than death, arriving reads
  // better snappy.
  static BIRTH_FADE_TICKS = 20;

  // Fraction of adult size every organism starts at (§22) — traits.size is now the
  // adult/mature size, not the current size.
  static STARTING_SIZE_FRACTION = 0.3;

  // Multiplies growthRate to get the per-tick growth step (§22) — tuned so a
  // mid-range organism reaches ~95% adult size at roughly a third of an average
  // lifespan. Starting guess, not empirically fit.
  static GROWTH_RATE_SCALE = 0.03;

  constructor(genomeA, genomeB, x, y) {
    this.id = LifeForm.nextId++;
    this.genomeA = genomeA instanceof Genome ? genomeA : new Genome(genomeA);
    this.genomeB = genomeB instanceof Genome ? genomeB : new Genome(genomeB);
    // Expression rule (§28): bitwise OR, "1 is dominant" — a bit only reads 0 if BOTH
    // strands have 0 there. Computed once here, not on every trait access.
    this.expressedGenome = new Genome(Genome.toHex(this.genomeA.value | this.genomeB.value));
    this.x = x;
    this.y = y;
    this.age = 0;
    this.state = 'idle';
    this.lastReproducedAt = 0;
    this.forcedDeath = false;
    this.energy = LifeForm.STARTING_ENERGY;
    this.traits = this.expressedGenome.decodeAll();
    this.currentSizeFraction = LifeForm.STARTING_SIZE_FRACTION; // §22

    // Fade-in (§18): every new LifeForm starts here, not just reproduction offspring —
    // the initial seed population fades in on page load too.
    this.birthTick = 0;
    // Fade-out (§18): null while alive; becomes a countdown once isAlive first goes false.
    this.deathTick = null;

    const heading = Math.random() * Math.PI * 2;
    this.vx = Math.cos(heading) * this.traits.speed;
    this.vy = Math.sin(heading) * this.traits.speed;
  }

  // Opacity for rendering (§18) — fading in, fading out, or fully visible.
  get displayOpacity() {
    if (this.deathTick !== null) {
      return Math.max(0, 1 - this.deathTick / LifeForm.FADE_TICKS);
    }
    if (this.birthTick !== null) {
      return Math.min(1, this.birthTick / LifeForm.BIRTH_FADE_TICKS);
    }
    return 1;
  }

  // Current size, not adult/mature size (§22) — traits.size is the adult value;
  // grows toward it over the organism's life via currentSizeFraction.
  get radius() {
    return this.traits.size * this.currentSizeFraction;
  }

  get displayRadius() {
    return this.radius * LifeForm.VISUAL_SCALE;
  }

  get isAlive() {
    return !this.forcedDeath && this.age < this.traits.lifespan && this.energy > 0;
  }

  // Death from something other than natural lifespan expiry — e.g. overcrowding (§11)
  // or being eaten (§15).
  die() {
    this.forcedDeath = true;
  }

  // Bonus energy from actively foraging/predating (§15), on top of passive regen —
  // clamped the same as passive regen, just applied on demand rather than every tick.
  feed(amount) {
    this.energy = Math.min(1, this.energy + amount);
  }

  // Full movementPattern dispatch (§17) — soup is needed for the patterns that sense
  // nearby food/threats/organisms; bounds for the wall-bounce, same as always.
  update(bounds, soup) {
    const pattern = this.traits.movementPattern;

    if (pattern === 'idle') {
      // Sessile — no movement at all, position never changes.
    } else if (pattern === 'ambush') {
      this.applyWander(LifeForm.WANDER, this.traits.speed * LifeForm.AMBUSH_SPEED_SCALE);
      this.moveAndBounce(bounds);
    } else {
      const target = this.findSteerTarget(pattern, soup);
      if (target) {
        this.steerToward(target.x, target.y, target.flee, this.traits.speed);
      } else {
        const wander = pattern === 'randomWalk' ? LifeForm.RANDOM_WALK_WANDER : LifeForm.WANDER;
        this.applyWander(wander, this.traits.speed);
      }
      this.moveAndBounce(bounds);
    }

    this.age += 1;

    // Growth (§22): asymptotic approach toward adult size, never overshoots 1.
    this.currentSizeFraction = Math.min(
      1,
      this.currentSizeFraction + this.traits.growthRate * LifeForm.GROWTH_RATE_SCALE * (1 - this.currentSizeFraction),
    );

    // Metabolism scales with CURRENT size, not adult size — juveniles cost less to
    // maintain than adults of the same genome (§22).
    const metabolism = LifeForm.BASE_METABOLISM_RATE * this.radius;
    const regen = this.traits.dietType === 'photosynthetic'
      ? LifeForm.PHOTOSYNTHETIC_REGEN_RATE
      : LifeForm.OTHER_DIET_REGEN_RATE;
    this.energy = Math.max(0, Math.min(1, this.energy - metabolism + regen));

    if (this.birthTick !== null) {
      this.birthTick += 1;
      if (this.birthTick >= LifeForm.BIRTH_FADE_TICKS) this.birthTick = null; // fully born
    }
  }

  // seekFood (diet-dependent), flee, seekMate, schooling — everything else (drift,
  // randomWalk, or a seek/flee pattern with nothing in range) returns null, meaning
  // "fall back to wander."
  findSteerTarget(pattern, soup) {
    const senseRadius = this.traits.senseRadius;

    if (pattern === 'seekFood') {
      if (Soup.PREDATOR_DIETS.has(this.traits.dietType)) {
        const prey = soup.findNearestEntity(this.x, this.y, senseRadius, (other) => (
          other !== this && other.isAlive && other.displayRadius < this.displayRadius
        ));
        if (prey) return { x: prey.x, y: prey.y, flee: false };
      }
      if (Soup.NUTRIENT_EATER_DIETS.has(this.traits.dietType)) {
        const nutrient = soup.findNearestNutrient(this.x, this.y, senseRadius);
        if (nutrient) return { x: nutrient.x, y: nutrient.y, flee: false };
      }
      return null;
    }

    if (pattern === 'flee') {
      const threat = soup.findNearestEntity(this.x, this.y, senseRadius, (other) => (
        other !== this && other.isAlive
        && Soup.PREDATOR_DIETS.has(other.traits.dietType)
        && other.displayRadius > this.displayRadius
      ));
      return threat ? { x: threat.x, y: threat.y, flee: true } : null;
    }

    if (pattern === 'seekMate') {
      const mate = soup.findNearestEntity(this.x, this.y, senseRadius, (other) => (
        other !== this && other.isAlive
        && Genome.areCompatible(this.expressedGenome.hex, other.expressedGenome.hex)
      ));
      return mate ? { x: mate.x, y: mate.y, flee: false } : null;
    }

    if (pattern === 'schooling') {
      const neighbors = soup.findEntitiesWithin(this.x, this.y, senseRadius, (other) => (
        other !== this && other.isAlive
      ));
      if (neighbors.length === 0) return null;
      const avgX = neighbors.reduce((sum, e) => sum + e.x, 0) / neighbors.length;
      const avgY = neighbors.reduce((sum, e) => sum + e.y, 0) / neighbors.length;
      return { x: avgX, y: avgY, flee: false };
    }

    return null; // drift, randomWalk
  }

  // Gentle/erratic random heading change at a given speed — drift/randomWalk, and the
  // fallback for any steering pattern with nothing currently in range.
  applyWander(wanderAmount, speed) {
    const heading = Math.atan2(this.vy, this.vx) + (Math.random() - 0.5) * wanderAmount;
    this.vx = Math.cos(heading) * speed;
    this.vy = Math.sin(heading) * speed;
  }

  // Turns toward (or, if fleeing, away from) a point at a capped rate per tick rather
  // than snapping instantly to face it.
  steerToward(targetX, targetY, flee, speed) {
    let desiredHeading = Math.atan2(targetY - this.y, targetX - this.x);
    if (flee) desiredHeading += Math.PI;

    const currentHeading = Math.atan2(this.vy, this.vx);
    let delta = desiredHeading - currentHeading;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const clampedDelta = Math.max(-LifeForm.STEER_RATE, Math.min(LifeForm.STEER_RATE, delta));

    const newHeading = currentHeading + clampedDelta;
    this.vx = Math.cos(newHeading) * speed;
    this.vy = Math.sin(newHeading) * speed;
  }

  moveAndBounce(bounds) {
    this.x += this.vx;
    this.y += this.vy;

    const r = this.displayRadius;
    if (this.x < r) {
      this.x = r;
      this.vx = Math.abs(this.vx);
    } else if (this.x > bounds.width - r) {
      this.x = bounds.width - r;
      this.vx = -Math.abs(this.vx);
    }

    if (this.y < r) {
      this.y = r;
      this.vy = Math.abs(this.vy);
    } else if (this.y > bounds.height - r) {
      this.y = bounds.height - r;
      this.vy = -Math.abs(this.vy);
    }
  }

  // Shared by asexual and sexual reproduction (§19) — cooldown, energy, and the
  // proclivityToProcreate roll. Evaluate ONCE per organism per tick and reuse the
  // result; calling this again for every candidate partner would re-roll proclivity
  // multiple times for the same organism in one tick.
  canAffordReproduction() {
    return (this.age - this.lastReproducedAt >= this.traits.reproductionCooldown)
      && (this.energy > this.traits.reproductionCost)
      && (Math.random() < this.traits.proclivityToProcreate);
  }

  recordReproduction() {
    this.lastReproducedAt = this.age;
    this.energy -= this.traits.reproductionCost;
  }

  // Asexual/budding/either (§19 — either falls back here when matePairs() found no
  // mate for it this tick; the cooldown check below is what prevents an either that
  // DID just mate from also reproducing asexually the same tick, no extra flag needed).
  // Diploid (§28): both strands are independently mutated copies of this organism's
  // corresponding strand. Returns { hexA, hexB } if reproduction happens this tick, else null.
  tryReproduce() {
    const type = this.traits.reproductionType;
    if (type !== 'asexual' && type !== 'budding' && type !== 'either') return null;
    if (!this.canAffordReproduction()) return null;

    this.recordReproduction();
    return {
      hexA: Genome.mutate(this.genomeA.hex, LifeForm.MUTATION_RATE),
      hexB: Genome.mutate(this.genomeB.hex, LifeForm.MUTATION_RATE),
    };
  }

  destroy() {
    this.genomeA.destroy();
    this.genomeB.destroy();
    this.expressedGenome.destroy();
  }
}
