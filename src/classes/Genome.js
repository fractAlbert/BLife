/**
 * Genome — a fixed-length 80-bit genome, stored as a 20-character hex string.
 * Traits are decoded from bit ranges defined in GENE_MAP (see docs/Game-Plan.md §5/§8).
 * Some trait ranges deliberately overlap (e.g. size/speed, growthRate/lifespan) so
 * mutation and crossover naturally couple those traits together.
 *
 * The last 10 bits (compatibilityTag) aren't a behavioral trait — they're a mate-recognition
 * marker. Two genomes are breeding-compatible if their tags are similar enough (see
 * Genome.hammingDistance / Genome.areCompatible). Because the tag mutates/crosses over like
 * any other bits, compatibility drifts across generations — lineages can drift apart until
 * they're no longer compatible, an emergent species boundary with no hardcoded species logic.
 */
class Genome {
  static BIT_LENGTH = 80;
  static HEX_LENGTH = Genome.BIT_LENGTH / 4;

  // Default max Hamming distance (out of 10 bits) for two genomes to be breeding-compatible.
  // Tunable — start restrictive-ish and adjust once there's a population to observe.
  static COMPATIBILITY_THRESHOLD = 2;

  static GENE_MAP = [
    { name: 'movementPattern', bitStart: 0, bitLength: 3, kind: 'enum',
      values: ['drift', 'randomWalk', 'seekFood', 'seekMate', 'flee', 'schooling', 'ambush', 'idle'] },
    { name: 'dietType', bitStart: 3, bitLength: 3, kind: 'enum',
      values: ['photosynthetic', 'detritivore', 'herbivore', 'predator', 'omnivore', 'scavenger', 'filterFeeder', 'parasite'] },
    { name: 'foodPreference', bitStart: 6, bitLength: 3, kind: 'linear', min: 0, max: 1 },
    { name: 'reproductionType', bitStart: 9, bitLength: 2, kind: 'enum',
      values: ['asexual', 'sexual', 'either', 'budding'] },
    { name: 'reproductionCooldown', bitStart: 11, bitLength: 4, kind: 'integer', min: 30, max: 240 },
    { name: 'bodyShapeVariant', bitStart: 15, bitLength: 3, kind: 'enum',
      values: ['shape0', 'shape1', 'shape2', 'shape3', 'shape4', 'shape5', 'shape6', 'shape7'] },
    { name: 'texturePattern', bitStart: 18, bitLength: 2, kind: 'enum',
      values: ['plain', 'spotted', 'striped', 'mottled'] },
    { name: 'saturation', bitStart: 20, bitLength: 3, kind: 'linear', min: 0.3, max: 1.0 },
    { name: 'hue', bitStart: 23, bitLength: 5, kind: 'linear', min: 0, max: 360 },

    // senseRadius / appendageCount deliberately overlap on bits 30-31
    { name: 'senseRadius', bitStart: 28, bitLength: 4, kind: 'integer', min: 20, max: 140 },
    { name: 'appendageCount', bitStart: 30, bitLength: 3, kind: 'integer', min: 1, max: 8 },

    // growthRate / lifespan deliberately overlap on bits 35-36
    { name: 'growthRate', bitStart: 33, bitLength: 4, kind: 'linear', min: 0.05, max: 0.5 },
    { name: 'lifespan', bitStart: 35, bitLength: 5, kind: 'integer', min: 200, max: 2000 },

    // speed / size deliberately overlap on bits 43-44; size / reproductionCost overlap on bits 47-48
    { name: 'speed', bitStart: 40, bitLength: 5, kind: 'linear', min: 0.2, max: 3.0 },
    { name: 'size', bitStart: 43, bitLength: 6, kind: 'integer', min: 4, max: 40 },
    { name: 'reproductionCost', bitStart: 47, bitLength: 3, kind: 'linear', min: 0.1, max: 0.6 },

    { name: 'offspringCount', bitStart: 50, bitLength: 3, kind: 'integer', min: 1, max: 8 },
    { name: 'appendageStyle', bitStart: 53, bitLength: 3, kind: 'enum',
      values: ['style0', 'style1', 'style2', 'style3', 'style4', 'style5', 'style6', 'style7'] },

    // Behavioral "desire" to mate — distinct from reproductionCooldown (a hard mechanical
    // limit on frequency) and reproductionCost (energy cost). This is a soft eagerness dial:
    // even an organism that's able to reproduce may not pursue it if this is low.
    { name: 'proclivityToProcreate', bitStart: 56, bitLength: 4, kind: 'linear', min: 0, max: 1 },

    // bits 60-69 reserved for future traits

    // Mate-recognition marker, not a behavioral trait — see class doc comment above.
    { name: 'compatibilityTag', bitStart: 70, bitLength: 10, kind: 'raw' },
  ];

  constructor(hex) {
    this.hex = hex ?? Genome.random();
  }

  get value() {
    return BigInt('0x' + this.hex);
  }

  decode(traitName) {
    const field = Genome.GENE_MAP.find((f) => f.name === traitName);
    if (!field) throw new Error(`Unknown trait: ${traitName}`);
    return Genome.decodeField(this.value, field);
  }

  decodeAll() {
    const result = {};
    for (const field of Genome.GENE_MAP) {
      result[field.name] = Genome.decodeField(this.value, field);
    }
    return result;
  }

  destroy() {
    this.hex = null;
  }

  static decodeField(genomeValue, field) {
    const mask = (1n << BigInt(field.bitLength)) - 1n;
    const raw = Number((genomeValue >> BigInt(field.bitStart)) & mask);
    const maxRaw = (1 << field.bitLength) - 1;

    switch (field.kind) {
      case 'enum':
        return field.values[raw % field.values.length];
      case 'integer':
        return Math.round(field.min + (raw / maxRaw) * (field.max - field.min));
      case 'raw':
        return raw;
      case 'linear':
      default:
        return field.min + (raw / maxRaw) * (field.max - field.min);
    }
  }

  static random() {
    let hex = '';
    for (let i = 0; i < Genome.HEX_LENGTH; i++) {
      hex += Math.floor(Math.random() * 16).toString(16);
    }
    return hex;
  }

  // Uniform crossover: each bit independently sourced from parent A or B.
  static crossover(hexA, hexB) {
    const a = BigInt('0x' + hexA);
    const b = BigInt('0x' + hexB);
    let child = 0n;
    for (let i = 0; i < Genome.BIT_LENGTH; i++) {
      const bit = BigInt(i);
      const source = Math.random() < 0.5 ? a : b;
      child |= ((source >> bit) & 1n) << bit;
    }
    return Genome.toHex(child);
  }

  // Point mutation: each bit independently flips with the given probability.
  static mutate(hex, bitFlipProbability = 0.02) {
    let value = BigInt('0x' + hex);
    for (let i = 0; i < Genome.BIT_LENGTH; i++) {
      if (Math.random() < bitFlipProbability) {
        value ^= (1n << BigInt(i));
      }
    }
    return Genome.toHex(value);
  }

  static toHex(value) {
    return value.toString(16).padStart(Genome.HEX_LENGTH, '0');
  }

  // Hamming distance between two genomes' compatibilityTag bits: how many of the tag's
  // bits differ. 0 = identical tag, up to the tag's bitLength if every bit differs.
  static tagDistance(hexA, hexB) {
    const field = Genome.GENE_MAP.find((f) => f.name === 'compatibilityTag');
    const a = BigInt('0x' + hexA);
    const b = BigInt('0x' + hexB);
    const mask = (1n << BigInt(field.bitLength)) - 1n;
    const tagA = (a >> BigInt(field.bitStart)) & mask;
    const tagB = (b >> BigInt(field.bitStart)) & mask;
    let diff = tagA ^ tagB;
    let count = 0;
    while (diff > 0n) {
      count += Number(diff & 1n);
      diff >>= 1n;
    }
    return count;
  }

  static areCompatible(hexA, hexB, maxDistance = Genome.COMPATIBILITY_THRESHOLD) {
    return Genome.tagDistance(hexA, hexB) <= maxDistance;
  }
}
