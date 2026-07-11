/**
 * renderGeneMapView — a genome-browser-style horizontal track visualizing every
 * Genome.GENE_MAP entry positioned by its real bitStart/bitLength. Overlapping traits
 * are packed into separate lanes so shared bits are visible as a column colored in two
 * lanes at once, rather than colliding. See docs/Game-Plan.md §12.
 */
function renderGeneMapView(hex) {
  const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

  const genome = new Genome(hex);
  const value = genome.value;
  const fields = Genome.GENE_MAP;

  const laneOf = assignGeneMapLanes(fields);
  const laneCount = Math.max(...laneOf.values()) + 1;

  const bitWidth = 10;
  const laneHeight = 32;
  const laneGap = 8;
  const marginTop = 8;
  const width = Genome.BIT_LENGTH * bitWidth;
  const height = marginTop * 2 + laneCount * (laneHeight + laneGap) - laneGap;

  const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
  svg.classList.add('gene-map');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMin meet');

  fields.forEach((field, index) => {
    const lane = laneOf.get(field.name);
    const x = field.bitStart * bitWidth;
    const y = marginTop + lane * (laneHeight + laneGap);
    const w = field.bitLength * bitWidth;
    const hue = (index / fields.length) * 360;
    const color = `hsl(${hue.toFixed(0)}, 65%, 55%)`;

    const group = document.createElementNS(SVG_NAMESPACE, 'g');
    group.classList.add('gene-map-field');

    for (let b = 0; b < field.bitLength; b++) {
      const bitIndex = field.bitStart + b;
      const bitValue = Number((value >> BigInt(bitIndex)) & 1n);
      const cell = document.createElementNS(SVG_NAMESPACE, 'rect');
      cell.setAttribute('x', x + b * bitWidth);
      cell.setAttribute('y', y);
      cell.setAttribute('width', bitWidth - 1);
      cell.setAttribute('height', laneHeight);
      cell.setAttribute('fill', color);
      cell.setAttribute('opacity', bitValue ? '1' : '0.35');
      group.appendChild(cell);
    }

    const outline = document.createElementNS(SVG_NAMESPACE, 'rect');
    outline.setAttribute('x', x);
    outline.setAttribute('y', y);
    outline.setAttribute('width', w);
    outline.setAttribute('height', laneHeight);
    outline.setAttribute('fill', 'none');
    outline.setAttribute('stroke', '#2a160d');
    outline.setAttribute('stroke-width', '1');
    outline.setAttribute('rx', '4');
    group.appendChild(outline);

    const decoded = Genome.decodeField(value, field);
    const displayValue = typeof decoded === 'number' ? decoded.toFixed(2) : decoded;

    const title = document.createElementNS(SVG_NAMESPACE, 'title');
    const lastBit = field.bitStart + field.bitLength - 1;
    title.textContent = `${field.name}: ${displayValue} (bits ${field.bitStart}-${lastBit})`;
    group.appendChild(title);

    if (w >= 42) {
      const label = document.createElementNS(SVG_NAMESPACE, 'text');
      label.setAttribute('x', x + w / 2);
      label.setAttribute('y', y + laneHeight / 2 + 3);
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('font-size', '8');
      label.setAttribute('fill', '#1a1a1a');
      label.textContent = field.name;
      group.appendChild(label);
    }

    svg.appendChild(group);
  });

  genome.destroy();
  return svg;
}

// Interval-scheduling lane packing: each trait goes in the first lane whose last
// occupant already ended before this trait starts, else a new lane opens. Returns a
// Map<traitName, laneIndex>.
function assignGeneMapLanes(fields) {
  const sorted = [...fields].sort((a, b) => a.bitStart - b.bitStart);
  const laneEnds = [];
  const laneOf = new Map();

  for (const field of sorted) {
    let placedLane = -1;
    for (let lane = 0; lane < laneEnds.length; lane++) {
      if (laneEnds[lane] <= field.bitStart) {
        placedLane = lane;
        break;
      }
    }
    if (placedLane === -1) {
      placedLane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[placedLane] = field.bitStart + field.bitLength;
    laneOf.set(field.name, placedLane);
  }

  return laneOf;
}
