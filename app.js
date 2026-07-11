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
const btnNewSoup = document.getElementById('btn-new-soup');
const btnResetSoup = document.getElementById('btn-reset-soup');
const spawnToolGrid = document.getElementById('spawn-tool-grid');
const spawnToolHint = document.getElementById('spawn-tool-hint');
const btnSpeed = document.getElementById('btn-speed');
const btnToggleGrid = document.getElementById('btn-toggle-grid');
const btnToggleStatsOverlay = document.getElementById('btn-toggle-stats-overlay');
const btnToggleSidePanel = document.getElementById('btn-toggle-side-panel');
const appLayout = document.querySelector('.app');

// Same size the very first page-load population uses (below) — "New Soup" recreates
// a soup like that one, just with a fresh random seed (§31).
const INITIAL_POPULATION = 18;

// canvas.width/height match its actual measured CSS pixel size, so 1 unit = 1 CSS
// pixel — same "no dead space or oval distortion" idea as the old SVG viewBox
// approach (§1), just via canvas's own sizing attributes instead (§25).
const soupWidth = soupRoot.clientWidth;
const soupHeight = soupRoot.clientHeight;
soupRoot.width = soupWidth;
soupRoot.height = soupHeight;
const soupCtx = soupRoot.getContext('2d');

const soup = new Soup({ width: soupWidth, height: soupHeight });
soup.spawnRandom(INITIAL_POPULATION);
// §31: what "Reset" rewinds back to — re-captured on every "New Soup" so Reset always
// targets this soup's actual starting point, not necessarily the original page load.
let currentSeed = soup.captureSeed();

function refreshStatusBar() {
  statusTick.textContent = `Tick: ${soup.tickCount}`;
  statusPopulation.textContent = `Population: ${soup.aliveCount}`;
  statusFood.textContent = `Food: ${soup.nutrients.length}`;
  statusDiversity.textContent = `Diversity: ${soup.calculateGeneticDiversity().toFixed(0)}%`;
}

// §37: both off by default, unchanged from how the soup has always looked.
let showGrid = false;
let showStatsOverlay = false;

function drawGridOverlay() {
  const spacing = 50; // purely visual choice, not tied to SpatialGrid.CELL_SIZE
  soupCtx.save();
  soupCtx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  soupCtx.lineWidth = 1;
  for (let x = spacing; x < soupRoot.width; x += spacing) {
    soupCtx.beginPath();
    soupCtx.moveTo(x, 0);
    soupCtx.lineTo(x, soupRoot.height);
    soupCtx.stroke();
  }
  for (let y = spacing; y < soupRoot.height; y += spacing) {
    soupCtx.beginPath();
    soupCtx.moveTo(0, y);
    soupCtx.lineTo(soupRoot.width, y);
    soupCtx.stroke();
  }
  soupCtx.restore();
}

// Mirrors the bottom status bar's current text — doesn't replace it, just an
// additional on-canvas copy for glancing at stats without looking away (§37).
function drawStatsOverlay() {
  const lines = [
    statusTick.textContent,
    statusPopulation.textContent,
    statusFood.textContent,
    statusDiversity.textContent,
    statusFps.textContent,
  ];
  const padding = 8;
  const lineHeight = 16;
  const boxWidth = 150;
  const boxHeight = padding * 2 + lineHeight * lines.length;

  soupCtx.save();
  soupCtx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  soupCtx.fillRect(8, 8, boxWidth, boxHeight);
  soupCtx.fillStyle = '#fff';
  soupCtx.font = '12px sans-serif';
  lines.forEach((line, i) => {
    soupCtx.fillText(line, 8 + padding, 8 + padding + lineHeight * (i + 1) - 4);
  });
  soupCtx.restore();
}

// Single render entry point (§37) — every call site draws the soup itself, then
// layers on whichever optional overlays are currently toggled on.
function renderFrame(time) {
  renderSoupCanvas(soupCtx, soup, time);
  if (showGrid) drawGridOverlay();
  if (showStatsOverlay) drawStatsOverlay();
}

renderFrame(performance.now());
refreshStatusBar();

let isRunning = true;
let selectedEntity = null;
let selectedStatsEl = null;

// §33: null when no spawn tool is armed, else one of Genome's dietType enum values.
let armedDietType = null;

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
  if (armedDietType) return; // §33: a placement click, not a selection click
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

// §31: shared cleanup after either button replaces the population out from under
// whatever was selected/open — the old entities no longer exist, so any view
// referencing one must close, and the status bar shouldn't show stale numbers.
function afterSoupReinitialize() {
  exitDetailView();
  showInspector(null);
  refreshStatusBar();
  renderFrame(performance.now());
}

btnNewSoup.addEventListener('click', () => {
  soup.reinitialize(null, INITIAL_POPULATION);
  currentSeed = soup.captureSeed();
  afterSoupReinitialize();
});

btnResetSoup.addEventListener('click', () => {
  soup.reinitialize(currentSeed);
  afterSoupReinitialize();
});

// §33: camelCase enum value -> "Title Case" label, e.g. "filterFeeder" -> "Filter Feeder".
function formatDietLabel(dietType) {
  return dietType.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}

// One button per dietType value, generated from the gene map rather than hardcoded, so
// this panel stays in sync if the gene map's diet list ever changes (§33).
const dietTypeField = Genome.GENE_MAP.find((f) => f.name === 'dietType');
const spawnToolButtons = new Map(); // dietType -> button, for updating the active highlight

for (const dietType of dietTypeField.values) {
  const button = document.createElement('button');
  button.className = 'spawn-tool-button';
  button.textContent = formatDietLabel(dietType);
  button.addEventListener('click', () => {
    armedDietType = armedDietType === dietType ? null : dietType;
    updateSpawnToolUI();
  });
  spawnToolGrid.appendChild(button);
  spawnToolButtons.set(dietType, button);
}

function updateSpawnToolUI() {
  for (const [dietType, button] of spawnToolButtons) {
    button.classList.toggle('active', dietType === armedDietType);
  }
  spawnToolHint.textContent = armedDietType
    ? `Spawn tool: ${formatDietLabel(armedDietType)} — click or drag in the soup to place, click the button again (or Esc) to stop.`
    : 'No spawn tool selected — click a diet above, then click or drag in the soup to place organisms.';
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && armedDietType) {
    armedDietType = null;
    updateSpawnToolUI();
  }
});

function spawnAt(x, y) {
  // §33: both diploid strands get the SAME forced dietType — the expressed trait is
  // the bitwise OR of the two (§28), so forcing only one strand could let stray bits
  // from the other strand's fully-random dietType field change the decoded result.
  const hexA = Genome.randomWithForcedEnum('dietType', armedDietType);
  const hexB = Genome.randomWithForcedEnum('dietType', armedDietType);
  soup.entities.push(new LifeForm(hexA, hexB, x, y));
  statusPopulation.textContent = `Population: ${soup.aliveCount}`;
  renderFrame(performance.now());
}

attachCanvasSpawnHandler(soupRoot, () => armedDietType, spawnAt);

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
  statusTick.textContent = `Tick: ${soup.tickCount}`;
  statusPopulation.textContent = `Population: ${soup.aliveCount}`;
  statusFood.textContent = `Food: ${soup.nutrients.length}`;
  refreshInspectorStats();
  renderFrame(time);
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
btnStep.addEventListener('click', stepOnce); // §36: always exactly one tick, speed setting doesn't apply

// §36: one fractional-tick accumulator drives both faster (>1x, multiple ticks/frame)
// and slower (<1x, a tick only every few frames) playback, rather than two separate
// code paths. At 1x this reduces to exactly one tick per frame, unchanged from before.
const SPEED_LEVELS = [0.5, 1, 2, 4];
let speedLevelIndex = 1; // starts at 1x
let tickAccumulator = 0;

function currentSpeedMultiplier() {
  return SPEED_LEVELS[speedLevelIndex];
}

btnSpeed.addEventListener('click', () => {
  speedLevelIndex = (speedLevelIndex + 1) % SPEED_LEVELS.length;
  btnSpeed.textContent = `${currentSpeedMultiplier()}x`;
});

function advanceSimulation(time) {
  tickAccumulator += currentSpeedMultiplier();
  let tickedThisFrame = false;
  while (tickAccumulator >= 1) {
    soup.tick();
    tickAccumulator -= 1;
    tickedThisFrame = true;
  }

  // Skip the status/inspector refresh on a frame where nothing actually changed —
  // rendering still happens below regardless, so wiggle/throb animation (driven by
  // wall-clock time, not tick count) stays smooth even on a frame with no tick.
  if (tickedThisFrame) {
    statusTick.textContent = `Tick: ${soup.tickCount}`;
    statusPopulation.textContent = `Population: ${soup.aliveCount}`;
    statusFood.textContent = `Food: ${soup.nutrients.length}`;
    refreshInspectorStats();
  }

  renderFrame(time);
}

// §37: side panel visibility affects the play area's rendered size, and the canvas's
// pixel buffer (§1) is otherwise only ever measured once at page load — re-measuring
// here avoids the soup visually stretching into its newly freed/reclaimed space.
function resizeCanvasToPlayArea() {
  const newWidth = soupRoot.clientWidth;
  const newHeight = soupRoot.clientHeight;
  soupRoot.width = newWidth;
  soupRoot.height = newHeight;
  soup.bounds = { width: newWidth, height: newHeight };
  renderFrame(performance.now());
}

btnToggleGrid.addEventListener('click', () => {
  showGrid = !showGrid;
  btnToggleGrid.textContent = `Toggle Grid (${showGrid ? 'On' : 'Off'})`;
});

btnToggleStatsOverlay.addEventListener('click', () => {
  showStatsOverlay = !showStatsOverlay;
  btnToggleStatsOverlay.textContent = `Toggle Stats Overlay (${showStatsOverlay ? 'On' : 'Off'})`;
});

btnToggleSidePanel.addEventListener('click', () => {
  const nowHidden = appLayout.classList.toggle('side-panel-hidden');
  btnToggleSidePanel.textContent = `Toggle Side Panel (${nowHidden ? 'Off' : 'On'})`;
  resizeCanvasToPlayArea();
});

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
    advanceSimulation(now);
  }

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
