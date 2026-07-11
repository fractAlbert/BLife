// Entry point for the game shell (index.html). See docs/Game-Plan.md §9-§25:
// organisms exist, drift/bounce/reproduce/die/feed around the soup (rendered on
// canvas, §25), and clicking one opens Organism View directly; Population View
// groups everyone by diet type.

const soupRoot = document.getElementById('soup');
const inspectorEmpty = document.getElementById('inspector-empty');
const inspectorContent = document.getElementById('inspector-content');
const organismView = document.getElementById('organism-view');
const organismViewContent = document.getElementById('organism-view-content');
const btnBackToSoupOrganism = document.getElementById('btn-back-to-soup-organism');
const populationView = document.getElementById('population-view');
const populationViewContent = document.getElementById('population-view-content');
const btnBackToSoupPopulation = document.getElementById('btn-back-to-soup-population');
const btnViewPopulation = document.getElementById('btn-view-population');
const statusTick = document.getElementById('status-tick');
const statusPopulation = document.getElementById('status-population');
const statusFood = document.getElementById('status-food');
const statusDiversity = document.getElementById('status-diversity');
const statusFps = document.getElementById('status-fps');
const statusSelected = document.getElementById('status-selected');
const btnPlayPause = document.getElementById('btn-play-pause');
const btnStep = document.getElementById('btn-step');

// canvas.width/height match its actual measured CSS pixel size, so 1 unit = 1 CSS
// pixel — same "no dead space or oval distortion" idea as the old SVG viewBox
// approach (§1), just via canvas's own sizing attributes instead (§25).
const soupWidth = soupRoot.clientWidth;
const soupHeight = soupRoot.clientHeight;
soupRoot.width = soupWidth;
soupRoot.height = soupHeight;
const soupCtx = soupRoot.getContext('2d');

const soup = new Soup({ width: soupWidth, height: soupHeight });
soup.spawnRandom(18);

renderSoupCanvas(soupCtx, soup, performance.now());
statusPopulation.textContent = `Population: ${soup.aliveCount}`;
statusFood.textContent = `Food: ${soup.nutrients.length}`;
statusDiversity.textContent = `Diversity: ${soup.calculateGeneticDiversity().toFixed(0)}%`;

let isRunning = true;
let selectedEntity = null;
let selectedStatsEl = null;

function setRunning(running) {
  isRunning = running;
  btnPlayPause.textContent = isRunning ? '⏸' : '▶';
  const label = isRunning ? 'Pause' : 'Play';
  btnPlayPause.setAttribute('aria-label', label);
  btnPlayPause.setAttribute('title', label);
}

function refreshInspectorStats() {
  if (!selectedEntity || !selectedStatsEl) return;
  selectedStatsEl.textContent = `#${selectedEntity.id} — age ${selectedEntity.age}, state ${selectedEntity.state}, `
    + `energy ${Math.round(selectedEntity.energy * 100)}%, `
    + `position (${selectedEntity.x.toFixed(0)}, ${selectedEntity.y.toFixed(0)})`;
}

// Compact, still-live summary only (§16) — the full trait table/gene data lives in
// Organism View exclusively now, not crammed into the 390px side panel.
function showInspector(entity) {
  selectedEntity = entity;

  if (!entity) {
    selectedStatsEl = null;
    inspectorEmpty.hidden = false;
    inspectorContent.hidden = true;
    inspectorContent.innerHTML = '';
    statusSelected.textContent = 'Selected: none';
    return;
  }

  inspectorEmpty.hidden = true;
  inspectorContent.hidden = false;
  inspectorContent.innerHTML = '';

  selectedStatsEl = document.createElement('p');
  selectedStatsEl.className = 'placeholder';
  inspectorContent.appendChild(selectedStatsEl);
  refreshInspectorStats();

  const viewButton = document.createElement('button');
  viewButton.className = 'view-organism-button';
  viewButton.textContent = 'View Organism';
  viewButton.addEventListener('click', () => showOrganismView(entity));
  inspectorContent.appendChild(viewButton);

  statusSelected.textContent = `Selected: #${entity.id}`;
}

// Clicking an organism in the soup jumps straight into Organism View (§16) — the
// Inspector's compact summary still updates too, so there's a quick-glance record of
// what's selected even after returning to the soup.
function onSoupClick(entity) {
  showInspector(entity);
  if (entity) showOrganismView(entity);
}

// Organism View's reference render animates via its own rAF loop, independent of the
// main sim loop (which stays paused while it's open, §12/§13). Tracked here so it can
// be cancelled on "Back to Soup" or when switching to a different organism's view.
let organismViewFrameId = null;

function stopOrganismViewAnimation() {
  if (organismViewFrameId !== null) {
    cancelAnimationFrame(organismViewFrameId);
    organismViewFrameId = null;
  }
}

// Shared by Organism View and Population View (§16) — both are paused snapshots of
// the soup, reached by leaving it rather than a modal on top of it.
function enterDetailView() {
  if (isRunning) setRunning(false); // pause if not already
  // Step stays disabled — "advance one tick" doesn't imply "return to the soup" the
  // way pressing Play does, so it keeps blocking the sim from ticking silently behind
  // a detail view. Play/Pause stays enabled on purpose (see its click handler below).
  btnStep.disabled = true;
  stopOrganismViewAnimation(); // in case one was already running for a different organism

  soupRoot.hidden = true;
  organismView.hidden = true;
  populationView.hidden = true;
}

function exitDetailView() {
  stopOrganismViewAnimation();
  organismView.hidden = true;
  populationView.hidden = true;
  soupRoot.hidden = false;
  btnStep.disabled = false;
  // Deliberately does not resume itself — callers decide (the explicit "Back to Soup"
  // buttons don't; the Play button's handler below does).
}

btnBackToSoupOrganism.addEventListener('click', exitDetailView);
btnBackToSoupPopulation.addEventListener('click', exitDetailView);

function showOrganismView(entity) {
  enterDetailView();

  organismViewContent.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'organism-header';

  const stats = document.createElement('p');
  stats.className = 'organism-stats';
  stats.textContent = `#${entity.id} — age ${entity.age}, state ${entity.state}, `
    + `energy ${Math.round(entity.energy * 100)}%, `
    + `position (${entity.x.toFixed(0)}, ${entity.y.toFixed(0)})`;
  header.appendChild(stats);

  const referenceContainer = document.createElement('div');
  referenceContainer.className = 'organism-reference-container';
  header.appendChild(referenceContainer);
  organismViewContent.appendChild(header);

  function animateReference(time) {
    referenceContainer.innerHTML = '';
    referenceContainer.appendChild(renderOrganismReference(entity, time));
    organismViewFrameId = requestAnimationFrame(animateReference);
  }
  organismViewFrameId = requestAnimationFrame(animateReference);

  const geneMapSection = document.createElement('div');
  geneMapSection.className = 'gene-map-section';
  const geneMapHeading = document.createElement('h3');
  geneMapHeading.textContent = 'Gene Map';
  geneMapSection.appendChild(geneMapHeading);
  geneMapSection.appendChild(renderGeneMapView(entity.expressedGenome.hex));
  organismViewContent.appendChild(geneMapSection);

  organismViewContent.appendChild(renderGenomeTable('Genome', entity.expressedGenome.hex));

  organismView.hidden = false;
}

// Persists across opens/closes (§16) — re-picking your preferred sort every time
// would be annoying.
let populationSortMode = 'type';

function showPopulationView() {
  enterDetailView();
  renderPopulationView();
  populationView.hidden = false;
}

function renderPopulationView() {
  populationViewContent.innerHTML = '';

  const sortBar = document.createElement('div');
  sortBar.className = 'population-sort-controls';
  for (const mode of [
    { key: 'type', label: 'Type' },
    { key: 'age', label: 'Age' },
    { key: 'size', label: 'Size' },
  ]) {
    const button = document.createElement('button');
    button.textContent = mode.label;
    button.className = 'sort-mode-button' + (populationSortMode === mode.key ? ' active' : '');
    button.addEventListener('click', () => {
      populationSortMode = mode.key;
      renderPopulationView();
    });
    sortBar.appendChild(button);
  }
  populationViewContent.appendChild(sortBar);

  // Corpses (fading out, §18) aren't real population members to browse/select.
  const aliveEntities = soup.entities.filter((entity) => entity.isAlive);

  if (populationSortMode === 'age') {
    const sorted = [...aliveEntities].sort((a, b) => b.age - a.age);
    appendPopulationGroup(`All Organisms — oldest first (${sorted.length})`, sorted);
  } else if (populationSortMode === 'size') {
    const sorted = [...aliveEntities].sort((a, b) => b.traits.size - a.traits.size);
    appendPopulationGroup(`All Organisms — largest first (${sorted.length})`, sorted);
  } else {
    // 'type': grouped by dietType (§16's original view), groups ordered by member count.
    const groups = new Map();
    for (const entity of aliveEntities) {
      const diet = entity.traits.dietType;
      if (!groups.has(diet)) groups.set(diet, []);
      groups.get(diet).push(entity);
    }
    const sortedGroups = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
    for (const [diet, entities] of sortedGroups) {
      appendPopulationGroup(`${diet} (${entities.length})`, entities);
    }
  }
}

// Shared by every sort mode — a heading plus a wrapping grid of clickable swatches.
function appendPopulationGroup(headingText, entities) {
  const section = document.createElement('div');
  section.className = 'population-group';

  const heading = document.createElement('h3');
  heading.textContent = headingText;
  section.appendChild(heading);

  const grid = document.createElement('div');
  grid.className = 'population-grid';
  for (const entity of entities) {
    const swatch = document.createElement('button');
    swatch.className = 'population-swatch';
    swatch.style.background = `hsl(${entity.traits.hue.toFixed(0)}, ${Math.round(entity.traits.saturation * 100)}%, 55%)`;
    swatch.title = `#${entity.id} — ${entity.traits.dietType}, age ${entity.age}, size ${entity.traits.size}`;
    swatch.addEventListener('click', () => showOrganismView(entity));
    grid.appendChild(swatch);
  }
  section.appendChild(grid);

  populationViewContent.appendChild(section);
}

btnViewPopulation.addEventListener('click', showPopulationView);

attachCanvasClickHandler(soup, soupRoot, onSoupClick);

// Only one top-menu dropdown open at a time, and clicking anywhere outside all of them
// closes whichever is open. Runs on document click (bubble phase), before the browser's
// own toggle behavior applies to whichever <summary> was actually clicked.
const menuGroups = document.querySelectorAll('.menu-group');
document.addEventListener('click', (event) => {
  for (const group of menuGroups) {
    if (!group.contains(event.target)) {
      group.open = false;
    }
  }
});

function stepOnce(time = performance.now()) {
  soup.tick();
  renderSoupCanvas(soupCtx, soup, time);
  statusTick.textContent = `Tick: ${soup.tickCount}`;
  statusPopulation.textContent = `Population: ${soup.aliveCount}`;
  statusFood.textContent = `Food: ${soup.nutrients.length}`;
  refreshInspectorStats();
}

btnPlayPause.addEventListener('click', () => {
  const inDetailView = !organismView.hidden || !populationView.hidden;
  if (inDetailView) {
    exitDetailView();
    setRunning(true); // exit-and-resume in one click, per §16
  } else {
    setRunning(!isRunning);
  }
});
btnStep.addEventListener('click', stepOnce);

// requestAnimationFrame loop always runs; isRunning just gates whether it does anything
// this frame, so Play/Pause doesn't need to start/stop the rAF chain itself.
let frameCount = 0;
let lastFpsUpdate = performance.now();

function loop(now) {
  frameCount += 1;
  if (now - lastFpsUpdate >= 1000) {
    statusFps.textContent = `FPS: ${Math.round((frameCount * 1000) / (now - lastFpsUpdate))}`;
    frameCount = 0;
    lastFpsUpdate = now;

    // Diversity (§20) is O(bitLength x aliveCount) — cheap, but not so cheap it should
    // run 60x/second for a number that's only glanceable. Piggybacks on this same
    // 1-second interval rather than its own timer.
    statusDiversity.textContent = `Diversity: ${soup.calculateGeneticDiversity().toFixed(0)}%`;
  }

  if (isRunning) {
    stepOnce(now);
  }

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
