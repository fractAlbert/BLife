const SVG_NS = 'http://www.w3.org/2000/svg';

// appendageStyle -> animation profile (§13). Rendering-level interpretation of an
// existing genome trait, not new genome bits. Amplitudes in radians (sway/travel) or
// as a fraction of appendage length (wave/stretch); 0 means that axis is inactive.
// Shared by the reference view (SVG, below) and the soup's canvas renderer (§25).
const APPENDAGE_ANIMATION_PROFILES = {
  style0: { sway: 0, travel: 0, wave: 0, stretch: 0 },
  style1: { sway: 0.35, travel: 0, wave: 0, stretch: 0 },
  style2: { sway: 0.12, travel: Math.PI / 4, wave: 0, stretch: 0 },
  style3: { sway: 0, travel: Math.PI * 2, wave: 0, stretch: 0 },
  style4: { sway: 0, travel: 0, wave: 0.25, stretch: 0 },
  style5: { sway: 0.25, travel: 0, wave: 0.15, stretch: 0 },
  style6: { sway: 0, travel: Math.PI / 2, wave: 0.15, stretch: 0 },
  style7: { sway: 0.2, travel: 0, wave: 0, stretch: 0.4 },
};

// Angular velocity bases (radians/sec at speed trait == 1), starting guesses per §13.
const TRAVEL_SPEED_BASE = 0.6;
const SWAY_SPEED_BASE = 2.5;
const WAVE_SPEED_BASE = 4.0;
const STRETCH_SPEED_BASE = 0.8;
const BODY_THROB_SCALE = 0.15;
const BODY_THROB_SPEED = 1.5;

/**
 * getAppendagePose — pure function: given an animation profile and timing inputs,
 * returns { angle, lengthScale } for one appendage. Separated from DOM code so the
 * math can be sanity-checked (e.g. via a plain Node script) without a browser.
 */
function getAppendagePose(profile, restAngle, phase, speedFactor, t) {
  let travelOffset = 0;
  if (profile.travel >= Math.PI * 2 - 1e-6) {
    // Full loop: continuous rotation, not back-and-forth.
    travelOffset = (t * TRAVEL_SPEED_BASE * speedFactor + phase) % (Math.PI * 2);
  } else if (profile.travel > 0) {
    travelOffset = Math.sin(t * TRAVEL_SPEED_BASE * speedFactor + phase) * (profile.travel / 2);
  }

  const swayOffset = profile.sway > 0
    ? Math.sin(t * SWAY_SPEED_BASE * speedFactor + phase * 1.3) * profile.sway
    : 0;

  const waveScale = profile.wave > 0
    ? 1 + Math.sin(t * WAVE_SPEED_BASE * speedFactor + phase * 1.7) * profile.wave
    : 1;
  const stretchScale = profile.stretch > 0
    ? 1 + Math.sin(t * STRETCH_SPEED_BASE * speedFactor + phase * 0.5) * profile.stretch
    : 1;

  return {
    angle: restAngle + travelOffset + swayOffset,
    lengthScale: waveScale * stretchScale,
  };
}

/**
 * getBodyThrobScale — pure function: body radius multiplier for the throb effect,
 * amplitude tied to growthRate (thematic reuse: growth <-> pulsing, §13).
 */
function getBodyThrobScale(growthRate, phase, t) {
  const amplitude = growthRate * BODY_THROB_SCALE;
  return 1 + Math.sin(t * BODY_THROB_SPEED + phase) * amplitude;
}

/**
 * renderOrganism — a hand-built shape (body silhouette + appendage shapes, §21) for
 * one LifeForm, colored from its decoded genome traits, drawn at an explicit center
 * point and radius. Used only by the Organism View reference render (§25 moved the
 * soup itself to canvas — this SVG path stays because it only ever draws one organism
 * at a time, so the DOM-churn problem that motivated the move never applied here).
 *
 * `time` (ms, e.g. a rAF timestamp) drives the §13 appendage/body animation. Defaults
 * to 0 (a fixed, non-animated pose) for callers that deliberately want a static
 * snapshot. A dying organism (§18) renders at a frozen pose (a corpse shouldn't still
 * be wiggling) and fading opacity.
 */
function renderOrganism(entity, cx, cy, radius, time = 0) {
  const color = `hsl(${entity.traits.hue.toFixed(0)}, ${Math.round(entity.traits.saturation * 100)}%, 55%)`;
  const isDying = entity.deathTick !== null && entity.deathTick !== undefined;
  const t = (isDying ? 0 : time) / 1000;
  const speedFactor = entity.traits.speed;
  const profile = APPENDAGE_ANIMATION_PROFILES[entity.traits.appendageStyle] || APPENDAGE_ANIMATION_PROFILES.style0;
  const strokeWidth = Math.max(0.5, radius * 0.08);

  const group = document.createElementNS(SVG_NS, 'g');
  group.dataset.entityId = entity.id;
  if (entity.displayOpacity !== undefined) {
    group.setAttribute('opacity', entity.displayOpacity);
  }

  const appendageCount = entity.traits.appendageCount;
  for (let i = 0; i < appendageCount; i++) {
    const restAngle = (i / appendageCount) * Math.PI * 2;
    const phase = entity.id * 0.7 + i * 0.9;
    const pose = getAppendagePose(profile, restAngle, phase, speedFactor, t);
    const length = radius * entity.traits.appendageLengthScale * pose.lengthScale;
    const tipX = cx + Math.cos(pose.angle) * (radius + length);
    const tipY = cy + Math.sin(pose.angle) * (radius + length);

    const shape = getAppendageShape(entity.traits.appendageStyle, cx, cy, tipX, tipY, strokeWidth);
    for (const el of renderShapeCommandsToSVG(shape, color, strokeWidth)) {
      group.appendChild(el);
    }
  }

  const bodyRadius = radius * getBodyThrobScale(entity.traits.growthRate, entity.id * 0.4, t);

  const body = document.createElementNS(SVG_NS, 'path');
  body.setAttribute('d', getBodyPath(entity.traits.bodyShapeVariant, cx, cy, bodyRadius));
  body.setAttribute('fill', color);
  body.setAttribute('stroke', '#2a160d');
  body.setAttribute('stroke-width', strokeWidth * 0.6);
  group.appendChild(body);

  return group;
}

// Reference-view magnification: displayRadius (~1-10px, tuned for the crowded soup) is
// too small to read at a glance, so Organism View (§12) scales it up with a floor so
// even the smallest organisms are clearly visible.
const REFERENCE_SCALE = 4;
const REFERENCE_MIN_RADIUS = 10;
const REFERENCE_VIEWBOX_SIZE = 100;

/**
 * renderOrganismReference — a standalone small SVG showing one organism enlarged and
 * centered, for the Organism View header (§12). `time` (ms) animates it the same as
 * the soup — Organism View drives this from its own independent rAF loop (see app.js)
 * since the main sim loop is paused while it's open.
 */
function renderOrganismReference(entity, time = 0) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.classList.add('organism-reference');
  svg.setAttribute('viewBox', `0 0 ${REFERENCE_VIEWBOX_SIZE} ${REFERENCE_VIEWBOX_SIZE}`);

  const radius = Math.max(entity.displayRadius * REFERENCE_SCALE, REFERENCE_MIN_RADIUS);
  const center = REFERENCE_VIEWBOX_SIZE / 2;
  svg.appendChild(renderOrganism(entity, center, center, radius, time));

  return svg;
}
