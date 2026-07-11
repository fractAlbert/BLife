/**
 * organismShapes — hand-built SVG shape generators for body/appendage variants (§21).
 * Body shapes keyed by bodyShapeVariant, appendage shapes keyed by appendageStyle.
 * Every shape is a small parametric point-sampling function, not freehand art, so it
 * stays cheap to (re)generate per organism per frame.
 */

const SHAPES_SVG_NS = 'http://www.w3.org/2000/svg';

// Each entry: how many points to sample, and angle -> {x, y} in unit-circle space.
const BODY_SHAPES = {
  shape0: {
    points: 24,
    shape: (a) => ({ x: Math.cos(a), y: Math.sin(a) }), // circle
  },
  shape1: {
    points: 24,
    shape: (a) => ({ x: Math.cos(a) * 1.3, y: Math.sin(a) * 0.8 }), // oval
  },
  shape2: {
    points: 24,
    shape: (a) => {
      const r = 1 - 0.4 * Math.cos(a); // tapers to a point near a=0
      return { x: Math.cos(a) * r, y: Math.sin(a) * r };
    },
  },
  shape3: {
    points: 28,
    shape: (a) => {
      const r = 1 + 0.15 * Math.sin(a * 3) + 0.08 * Math.sin(a * 5 + 1); // amoeba-like bumps
      return { x: Math.cos(a) * r, y: Math.sin(a) * r };
    },
  },
  shape4: {
    points: 28,
    shape: (a) => {
      const r = 1 + 0.35 * Math.sin(a * 7); // spiky star
      return { x: Math.cos(a) * r, y: Math.sin(a) * r };
    },
  },
  shape5: {
    points: 24,
    shape: (a) => {
      const r = 1 - 0.3 * Math.cos(a); // single-side indent (bean/kidney)
      return { x: Math.cos(a) * r, y: Math.sin(a) * r };
    },
  },
  shape6: {
    points: 5, // few points, no smoothing -> straight angular edges
    shape: (a) => ({ x: Math.cos(a), y: Math.sin(a) }), // pentagon
  },
  shape7: {
    points: 18,
    shape: (a) => {
      const r = 1 + 0.4 * Math.sin(a * 3); // trefoil / clover
      return { x: Math.cos(a) * r, y: Math.sin(a) * r };
    },
  },
};

/**
 * getBodyPath — an SVG path `d` string for the given bodyShapeVariant, centered at
 * (cx, cy) with the given radius.
 */
function getBodyPath(variant, cx, cy, radius) {
  const def = BODY_SHAPES[variant] || BODY_SHAPES.shape0;
  const coords = [];
  for (let i = 0; i < def.points; i++) {
    const angle = (i / def.points) * Math.PI * 2;
    const p = def.shape(angle);
    coords.push([cx + p.x * radius, cy + p.y * radius]);
  }

  let d = `M ${coords[0][0].toFixed(2)} ${coords[0][1].toFixed(2)}`;
  for (let i = 1; i <= coords.length; i++) {
    const [x, y] = coords[i % coords.length];
    d += ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return `${d} Z`;
}

/**
 * getAppendageShape — pure geometry, no DOM: returns an array of primitive draw
 * commands ({type:'line'|'circle'|'polygon'|'polyline'|'quadratic', ...}) describing
 * the connection from the body edge (x1, y1) to the tip (x2, y2) that §13's animation
 * math already computed the angle/length for. Deliberately renderer-agnostic — an SVG
 * adapter (renderShapeCommandsToSVG, below) converts this to DOM; a canvas renderer
 * would consume the exact same command list via ctx.moveTo/lineTo/arc/quadraticCurveTo
 * instead, per §7's "visual params are data" promise. Only how the connection is drawn
 * changes per appendageStyle, never the positions themselves.
 */
function getAppendageShape(style, x1, y1, x2, y2, strokeWidth) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = dx / len;
  const ny = dy / len;
  const px = -ny; // unit perpendicular
  const py = nx;

  switch (style) {
    case 'style1': // beaded cilium
      return [
        { type: 'line', x1, y1, x2, y2 },
        { type: 'circle', cx: x2, cy: y2, r: strokeWidth * 1.3 },
      ];

    case 'style2': { // paddle/fin
      const finSize = strokeWidth * 2.2;
      const bx = x2 - nx * finSize;
      const by = y2 - ny * finSize;
      return [
        { type: 'line', x1, y1, x2: bx, y2: by },
        {
          type: 'polygon',
          points: [
            [x2, y2],
            [bx + px * finSize * 0.6, by + py * finSize * 0.6],
            [bx - px * finSize * 0.6, by - py * finSize * 0.6],
          ],
        },
      ];
    }

    case 'style3': // long thin whip
      return [
        { type: 'line', x1, y1, x2, y2, widthScale: 0.8 },
        { type: 'circle', cx: x2, cy: y2, r: strokeWidth * 0.7 },
      ];

    case 'style4': // hooked flick
      return [{
        type: 'quadratic',
        x1, y1,
        cx: x1 + dx * 0.7, cy: y1 + dy * 0.7,
        x2: x2 + px * len * 0.25, y2: y2 + py * len * 0.25,
      }];

    case 'style5': { // frilly pair
      const spread = strokeWidth * 1.5;
      return [
        { type: 'line', x1: x1 + px * spread, y1: y1 + py * spread, x2: x2 + px * spread * 1.5, y2: y2 + py * spread * 1.5, widthScale: 0.7 },
        { type: 'line', x1: x1 - px * spread, y1: y1 - py * spread, x2: x2 - px * spread * 1.5, y2: y2 - py * spread * 1.5, widthScale: 0.7 },
      ];
    }

    case 'style6': // bulbed tentacle
      return [
        { type: 'line', x1, y1, x2, y2 },
        { type: 'circle', cx: x2, cy: y2, r: strokeWidth * 2 },
      ];

    case 'style7': { // wavy elastic tendril
      const segments = 4;
      const points = [[x1, y1]];
      for (let i = 1; i <= segments; i++) {
        const t = i / segments;
        const bx = x1 + dx * t;
        const by = y1 + dy * t;
        const wobble = (i % 2 === 0 ? 1 : -1) * strokeWidth * 1.2;
        points.push([bx + px * wobble, by + py * wobble]);
      }
      return [{ type: 'polyline', points }];
    }

    case 'style0':
    default: // plain spike
      return [{ type: 'line', x1, y1, x2, y2 }];
  }
}

/**
 * renderShapeCommandsToSVG — the ONLY SVG-DOM-touching part of appendage rendering.
 * Converts getAppendageShape()'s portable command list into actual SVG elements.
 * A canvas renderer would replace just this function, never getAppendageShape().
 */
function renderShapeCommandsToSVG(commands, color, strokeWidth) {
  const elements = [];

  for (const cmd of commands) {
    switch (cmd.type) {
      case 'line': {
        const el = document.createElementNS(SHAPES_SVG_NS, 'line');
        el.setAttribute('x1', cmd.x1);
        el.setAttribute('y1', cmd.y1);
        el.setAttribute('x2', cmd.x2);
        el.setAttribute('y2', cmd.y2);
        el.setAttribute('stroke', color);
        el.setAttribute('stroke-width', strokeWidth * (cmd.widthScale || 1));
        el.setAttribute('stroke-linecap', 'round');
        elements.push(el);
        break;
      }
      case 'circle': {
        const el = document.createElementNS(SHAPES_SVG_NS, 'circle');
        el.setAttribute('cx', cmd.cx);
        el.setAttribute('cy', cmd.cy);
        el.setAttribute('r', cmd.r);
        el.setAttribute('fill', color);
        elements.push(el);
        break;
      }
      case 'polygon': {
        const el = document.createElementNS(SHAPES_SVG_NS, 'polygon');
        el.setAttribute('points', cmd.points.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' '));
        el.setAttribute('fill', color);
        elements.push(el);
        break;
      }
      case 'polyline': {
        let d = `M ${cmd.points[0][0].toFixed(2)} ${cmd.points[0][1].toFixed(2)}`;
        for (let i = 1; i < cmd.points.length; i++) {
          d += ` L ${cmd.points[i][0].toFixed(2)} ${cmd.points[i][1].toFixed(2)}`;
        }
        const el = document.createElementNS(SHAPES_SVG_NS, 'path');
        el.setAttribute('d', d);
        el.setAttribute('fill', 'none');
        el.setAttribute('stroke', color);
        el.setAttribute('stroke-width', strokeWidth);
        el.setAttribute('stroke-linecap', 'round');
        elements.push(el);
        break;
      }
      case 'quadratic': {
        const el = document.createElementNS(SHAPES_SVG_NS, 'path');
        el.setAttribute('d', `M ${cmd.x1.toFixed(2)} ${cmd.y1.toFixed(2)} Q ${cmd.cx.toFixed(2)} ${cmd.cy.toFixed(2)} ${cmd.x2.toFixed(2)} ${cmd.y2.toFixed(2)}`);
        el.setAttribute('fill', 'none');
        el.setAttribute('stroke', color);
        el.setAttribute('stroke-width', strokeWidth);
        el.setAttribute('stroke-linecap', 'round');
        elements.push(el);
        break;
      }
      default:
        break;
    }
  }

  return elements;
}
