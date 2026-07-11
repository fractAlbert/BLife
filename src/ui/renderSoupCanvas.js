/**
 * renderSoupCanvas — the soup's canvas renderer (§25), replacing the SVG DOM-reuse
 * approach from §23/§24 after a real, measured performance regression there. Draws
 * nutrients, organisms, and birth effects fresh into one canvas every frame — canvas
 * has no persistent DOM tree to reuse, so there's no caching to do; issuing direct
 * drawing commands every frame is what it's fast at.
 *
 * Reuses getAppendageShape/getBodyPath/getAppendagePose/getBodyThrobScale/
 * APPENDAGE_ANIMATION_PROFILES exactly as-is from organismShapes.js/renderSoup.js —
 * the §21 portability refactor (splitting geometry data from DOM construction) meant
 * this migration needed only a new adapter, not new geometry code.
 */

const BIRTH_EFFECT_MAX_RADIUS = 14;

/**
 * drawShapeCommandsToCanvas — the canvas counterpart to renderShapeCommandsToSVG/
 * updateShapeElementsFromCommands (organismShapes.js): interprets the same portable
 * command list via ctx drawing calls instead of DOM elements.
 */
function drawShapeCommandsToCanvas(ctx, commands, color, strokeWidth) {
  for (const cmd of commands) {
    switch (cmd.type) {
      case 'line':
        ctx.strokeStyle = color;
        ctx.lineWidth = strokeWidth * (cmd.widthScale || 1);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cmd.x1, cmd.y1);
        ctx.lineTo(cmd.x2, cmd.y2);
        ctx.stroke();
        break;

      case 'circle':
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(cmd.cx, cmd.cy, cmd.r, 0, Math.PI * 2);
        ctx.fill();
        break;

      case 'polygon':
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(cmd.points[0][0], cmd.points[0][1]);
        for (let i = 1; i < cmd.points.length; i++) ctx.lineTo(cmd.points[i][0], cmd.points[i][1]);
        ctx.closePath();
        ctx.fill();
        break;

      case 'polyline':
        ctx.strokeStyle = color;
        ctx.lineWidth = strokeWidth;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cmd.points[0][0], cmd.points[0][1]);
        for (let i = 1; i < cmd.points.length; i++) ctx.lineTo(cmd.points[i][0], cmd.points[i][1]);
        ctx.stroke();
        break;

      case 'quadratic':
        ctx.strokeStyle = color;
        ctx.lineWidth = strokeWidth;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cmd.x1, cmd.y1);
        ctx.quadraticCurveTo(cmd.cx, cmd.cy, cmd.x2, cmd.y2);
        ctx.stroke();
        break;

      default:
        break;
    }
  }
}

function drawNutrientsToCanvas(ctx, soup) {
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = '#c9d94a';
  for (const nutrient of soup.nutrients) {
    ctx.beginPath();
    ctx.arc(nutrient.x, nutrient.y, Soup.NUTRIENT_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawOrganismToCanvas(ctx, entity, time) {
  const cx = entity.x;
  const cy = entity.y;
  const radius = entity.displayRadius;
  const color = `hsl(${entity.traits.hue.toFixed(0)}, ${Math.round(entity.traits.saturation * 100)}%, 55%)`;
  const isDying = entity.deathTick !== null && entity.deathTick !== undefined;
  const t = (isDying ? 0 : time) / 1000;
  const speedFactor = entity.traits.speed;
  const profile = APPENDAGE_ANIMATION_PROFILES[entity.traits.appendageStyle] || APPENDAGE_ANIMATION_PROFILES.style0;
  const strokeWidth = Math.max(0.5, radius * 0.08);

  ctx.globalAlpha = entity.displayOpacity;

  const appendageCount = entity.traits.appendageCount;
  for (let i = 0; i < appendageCount; i++) {
    const restAngle = (i / appendageCount) * Math.PI * 2;
    const phase = entity.id * 0.7 + i * 0.9;
    const pose = getAppendagePose(profile, restAngle, phase, speedFactor, t);
    const length = radius * entity.traits.appendageLengthScale * pose.lengthScale;
    const tipX = cx + Math.cos(pose.angle) * (radius + length);
    const tipY = cy + Math.sin(pose.angle) * (radius + length);

    const shape = getAppendageShape(entity.traits.appendageStyle, cx, cy, tipX, tipY, strokeWidth);
    drawShapeCommandsToCanvas(ctx, shape, color, strokeWidth);
  }

  const bodyRadius = radius * getBodyThrobScale(entity.traits.growthRate, entity.id * 0.4, t);
  const bodyPath = new Path2D(getBodyPath(entity.traits.bodyShapeVariant, cx, cy, bodyRadius));
  ctx.fillStyle = color;
  ctx.strokeStyle = '#2a160d';
  ctx.lineWidth = strokeWidth * 0.6;
  ctx.fill(bodyPath);
  ctx.stroke(bodyPath);

  ctx.globalAlpha = 1;
}

function drawBirthEffectsToCanvas(ctx, soup) {
  ctx.strokeStyle = '#fff2b0';
  ctx.lineWidth = 1.5;
  for (const effect of soup.birthEffects) {
    const progress = effect.tick / Soup.BIRTH_EFFECT_TICKS;
    ctx.globalAlpha = Math.max(0, 1 - progress);
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, 1 + progress * BIRTH_EFFECT_MAX_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/**
 * renderSoupCanvas — clears and redraws the whole soup (nutrients, organisms, birth
 * effects) into ctx every frame. `time` (ms) drives appendage/body animation (§13),
 * same as the old SVG renderer.
 */
function renderSoupCanvas(ctx, soup, time) {
  ctx.clearRect(0, 0, soup.bounds.width, soup.bounds.height);
  drawNutrientsToCanvas(ctx, soup);
  for (const entity of soup.entities) {
    drawOrganismToCanvas(ctx, entity, time);
  }
  drawBirthEffectsToCanvas(ctx, soup);
}

// Screen coordinates -> the canvas's local pixel space, via getBoundingClientRect.
// Shared by attachCanvasClickHandler and attachCanvasSpawnHandler (§33) rather than
// duplicating the scale/offset math a second time.
function canvasEventToLocal(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
}

/**
 * attachCanvasClickHandler — one click listener on the canvas, converting screen
 * coordinates to the canvas's local pixel space via getBoundingClientRect, then
 * hit-testing via Soup.findEntityAt (unchanged from the SVG version, §7's
 * coordinate-based hit-testing needed no changes for this migration).
 */
function attachCanvasClickHandler(soup, canvas, onSelect) {
  canvas.addEventListener('click', (event) => {
    const { x, y } = canvasEventToLocal(canvas, event);
    onSelect(soup.findEntityAt(x, y));
  });
}

/**
 * attachCanvasSpawnHandler — click-to-place and drag-to-paint for spawn tools (§33).
 * `getArmedDietType()` is queried on every event (not captured once) so the armed tool
 * can change between events; `onSpawnAt(x, y)` does the actual placement. Placements
 * during a drag are throttled to at least `minPaintDistance` apart so a single drag
 * gesture paints a trail rather than one organism per pixel of mouse movement.
 */
function attachCanvasSpawnHandler(canvas, getArmedDietType, onSpawnAt, minPaintDistance = 20) {
  let painting = false;
  let lastX = null;
  let lastY = null;

  function maybePlace(x, y) {
    if (lastX !== null) {
      const dx = x - lastX;
      const dy = y - lastY;
      if (Math.sqrt(dx * dx + dy * dy) < minPaintDistance) return;
    }
    onSpawnAt(x, y);
    lastX = x;
    lastY = y;
  }

  canvas.addEventListener('mousedown', (event) => {
    if (!getArmedDietType()) return;
    painting = true;
    lastX = null;
    lastY = null;
    const { x, y } = canvasEventToLocal(canvas, event);
    maybePlace(x, y);
  });

  canvas.addEventListener('mousemove', (event) => {
    if (!painting || !getArmedDietType()) return;
    const { x, y } = canvasEventToLocal(canvas, event);
    maybePlace(x, y);
  });

  window.addEventListener('mouseup', () => {
    painting = false;
  });
}
