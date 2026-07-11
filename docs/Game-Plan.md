# BLife — Design Plan

Builds on `Initial-requirements.txt`. Covers screen layout, menu/control options, navigation, and the data model for life objects.

## 1. Screen Layout

```
+----------------------------------------------------------+
|  Top Menu Bar                                             |
+--------+---------------------------------------------------+
|        |                                                   |
| Side   |                                                   |
| Panel  |              Play Area (the Soup)                 |
|        |              <canvas>, pannable/zoomable          |
|        |                                                   |
|        |                                                   |
+--------+---------------------------------------------------+
|  Status Bar (tick count, population, FPS, selected entity) |
+----------------------------------------------------------+
```

- **Top menu bar** — thin strip, dropdown/button style, global actions.
- **Side panel** — collapsible, holds spawn tools, environment sliders, and the inspector for whatever is currently selected. Widened from the initial 260px to 390px (50% wider) once the Inspector's genome trait list needed more breathing room.
- **Play area** — the soup itself. A `<canvas>` rendered with native JS (no libraries). Owns its own pan/zoom transform.
- **Status bar** — optional but cheap to add; useful for debugging and for players who want a pulse on the simulation.

### Soup visual style (v1, simplified)

Superseded the wavy/clipped-frame experiment below — it kept producing large letterboxed dead space on window shapes far from 4:3, and fighting `preserveAspectRatio` modes (`slice`/`none`/`meet`) only ever traded one failure mode for another. Simplified instead:

- **Plain flat fill, straight edges, no wave/gradient/mask.** The soup is a flat orange rectangle filling the entire play-area — no turbulence filter, no radial gradient, no clip mask, no floating "bits" decoration. Plain on purpose.
- **A simple foreground border**, straight-edged, in a darker orange, drawn on top of the fill (and, once organisms exist, on top of them too — like a dish rim in front of the liquid) rather than clipping anything.
- **Both the fill and the border are plain CSS** (`background` + `border` on `.play-area`) — no SVG needed for either now that there's no wave/gradient/mask effect to produce. The `#soup` SVG holds only the organism layer.
- **Root cause of the dead space, fixed properly**: rather than reconciling a fixed abstract viewBox (400×300) against whatever aspect ratio the actual container happens to be, the `#soup` SVG's `viewBox` is now set at startup to the container's actual measured pixel size (`clientWidth`/`clientHeight`), read once in `app.js`. Since the viewBox then always exactly matches the element's rendered size, there is no scale/crop/stretch transform at all (1 SVG unit = 1 CSS pixel) — no dead space, no letterboxing, no oval distortion, regardless of window shape. `Soup.bounds` is set from the same measurement so organisms spawn across the full real area. Known limitation: this is measured once at startup, not on resize — acceptable for now since there's no persistent movement/tick loop yet for a stale bounds value to visibly matter; worth revisiting once movement exists.

<details>
<summary>Superseded: wavy/clipped-frame version (kept for history)</summary>

- **Wavy/organic edge** — rather than hand-authoring wavy path coordinates, the edge is a shape distorted by a native SVG filter (`feTurbulence` + `feDisplacementMap`). This gives an organic, undulating outline with two tunable numbers (turbulence `baseFrequency`, displacement `scale`) instead of a hand-fitted shape — easy to nudge later without redrawing anything.
- **Orangish fill** — a radial gradient (warm orange center fading toward a deeper burnt-orange edge), evoking a primordial-soup pond rather than a sterile background.
- **Floating "bits"** — small scattered circles in muted browns/yellows/greens across the soup, suggesting debris/nutrient specks drifting in the liquid.
- **Squared viewport, small even margin**: the base shape was a softly-rounded `<rect>` inset by a small fixed margin, rather than a true ellipse (an ellipse inscribed in a rectangle leaves much bigger gaps at the corners than at the edge midpoints).
- **`preserveAspectRatio` tuning**: tried `slice` (cropped margin off top/bottom on wide windows), then `none` (fixed that but stretched organisms into ovals), then `meet` (fixed both, but letterboxing could still get large on extreme window aspects — this is the "sooo much dead space again" that led to abandoning the approach).
- **Soup as a clipping frame**: background and organism layer shared one `<svg id="soup">` so a `<mask>` (same rect + same filter as the visible background) could clip organisms to the wavy silhouette, so they'd visually swim behind the edge. Abandoned along with the rest of this approach — no more masking.

</details>

### Overall UI visual style (v1)

The chrome (menu bar, side panel, status bar) originally used a cold gray/navy dashboard palette that clashed with the soup's warm cartoon treatment — extending the same visual language to the whole shell instead:

- **Palette**: warm cream/parchment base (`#fdf6ea`-ish) for the page and side panel, replacing cold gray, with a deep warm brown (`#3a2418`-ish) for the top menu bar, status bar, and play-area frame — chosen to complement the soup's orange rather than compete with it.
- **Panels** get chunkier rounded corners and a visible warm-brown border instead of a thin gray hairline, reading more like a cartoon sticker than a flat admin dashboard.
- **Dropdown menus** move their hover state from cold blue-gray to warm cream, matching the rest of the palette.
- Scope: palette/shape only, no new fonts pulled in — stays self-contained/offline-friendly rather than depending on a network font.

## 2. Top Menu Options

| Menu | Items |
|---|---|
| Simulation | New Soup, Save State, Load State, Reset |
| View | Reset Camera, Toggle Grid, Toggle Stats Overlay, Toggle Side Panel |
| Debug | Genome Test Page — opens the standalone genome demo (`genome-test.html`) in a new tab. Behind-the-scenes tooling, not part of the player-facing game; kept in its own menu so it's clearly separate from Simulation/View. |
| Help | About, Controls Reference |

**Playback controls (Play/Pause, Step, Speed) are not a dropdown** — moved to an always-visible toolbar at the far right of the top menu bar instead, per the note originally left here: burying the controls you use constantly (start/stop/step) behind a click-to-open menu was a real annoyance once §10's simulation loop existed to actually pause and step through. `Play/Pause` toggles the loop and its own label; `Step` advances exactly one tick; `Speed` is still a disabled placeholder (no tick-rate multiplier implemented yet). No separate "Playback" menu remains — it would've been left with only the disabled `Speed` item.

**Implementation note**: menu groups are built as native `<details>/<summary>` dropdowns — opening/closing a single menu needs no JS, consistent with native-JS-only. A small bit of JS (in `app.js`) enforces two things `<details>` doesn't give for free: only one menu open at a time (opening one closes any other that was open), and clicking anywhere outside all menus closes whichever is open. Both are handled by one document-level click listener that closes any menu-group `<details>` not containing the click target, run before the browser's own toggle behavior applies to the clicked one. Items with no backing functionality yet (everything except Debug → Genome Test Page, which is just a plain link) render as disabled buttons rather than being omitted, so the full menu shape is visible early and gets wired up incrementally.

## 3. Side Panel Controls

- **Spawn tools** — buttons/icons for each life type; click a tool then click the soup to place one, or drag to paint several.
- **Environment controls** — sliders/inputs for things like nutrient density, temperature, "current" (fluid drift direction/strength), lighting/energy zones — whatever the soup's environmental parameters end up being.
- **Zoom control** — slider or +/- buttons, mirroring scroll-wheel zoom.
- **Inspector** — when an organism is clicked/selected, shows its live stats and its full genome breakdown:
  - Live stats: name/lineage label, age, energy, current state (per §5's `state` field).
  - **Decoded traits** — every entry from `Genome.decodeAll()` (§8), rendered as label/value pairs with the value stacked below its label (a `<dl>`, not a side-by-side table — a two-column table didn't leave enough width for long trait names like `proclivityToProcreate` in the side panel, even at the widened panel width below) — exactly the same format the Debug → Genome Test page already uses. The rendering is a single shared helper (`renderGenomeTable(label, hex)` in `src/ui/genomeTable.js`) called by both the debug page and the inspector, rather than two copies of the same building code.
  - **Raw genome hex** — the organism's genome string displayed as-is, for the curious/for debugging, same as the debug page shows it.
  - Clicking empty soup (no organism under the cursor, and not a drag) clears the selection and the inspector reverts to its "no organism selected" placeholder.
- **Population/legend** — running count per species type, with a color/icon key.

## 4. Navigation & Input Controls

| Input | Action |
|---|---|
| Scroll wheel | Zoom in/out, centered on cursor |
| Click + drag (empty soup) | Pan the view |
| Click (on organism) | Select it → inspector updates |
| Drag (with spawn tool active) | Paint/place organisms |
| Spacebar | Play/Pause |
| Right/Left arrow or `.`/`,` | Step forward one tick / speed down-up |
| `+` / `-` | Zoom in/out |
| `0` | Reset camera to default zoom/position |
| Esc | Deselect / close open panel |
| Pinch (touch) | Zoom, for tablet support later |

Camera state (pan offset + zoom level) should live on the Soup class itself so it can be saved/restored along with everything else.

## 5. Life Object Data Model

The requirements doc already calls out movement, feeding, growth, reproduction, name, and lifespan. Filling in what a simulation like this typically needs on top of that:

### Identity & lineage
- `id` — unique instance id (needed for selection, save/load, and reproduction targeting)
- `species` — reference to which life-type class this is
- `generation` / `parentIds` — optional, but useful if we ever want to show ancestry or evolving traits

### Physical state
- `position` (x, y)
- `heading` / `velocity` — direction and speed of current movement
- `size` — current size, distinct from a species' base/max size (organisms grow over time)
- `color`/`visualVariant` — for rendering, possibly derived from traits

### Vital stats
- `age` — ticks alive, compared against `lifespan`
- `energy` / `hunger` — depletes over time and with movement, replenished by feeding; hitting zero likely means starvation/death
- `health` — separate from energy if we want predation/damage to be a thing, otherwise energy alone may be enough
- `state` — simple state machine: e.g. `idle`, `seeking food`, `feeding`, `fleeing`, `seeking mate`, `reproducing`, `dead`

### Traits / genome (data-driven, per instance)

Per developer feedback, mutation and cross-species breeding are both in scope. That means these can't be hard-coded constants on a per-species class — they have to be per-instance values that get inherited (with mutation) from parent(s):

- `genome` — this instance's actual bit-string genome (see "Genome encoding" below). All the traits listed here (`movementPattern`, `speed`, `diet`, `senseRadius`, `growthRate`, `reproductionType`, `reproductionCooldown`/`reproductionCost`, `offspringCount`, `lifespan`, and the visual parameters in §7) are *decoded* from it — they are not stored independently.
- **Reproduction → genome derivation**: asexual reproduction copies the parent's genome and applies bit mutation; sexual/cross-species reproduction builds the offspring's genome via bit-level crossover of both parents' genomes, then applies mutation. Details below.
- `speciesTag` / `lineageLabel` — a descriptive label rather than a rigid type, since cross-breeding blurs species lines. Useful for the legend/population counts/analytics, not for control flow.
- `name` — now more of a starting archetype label (what a fresh, unmutated instance is seeded from) than a fixed identity every instance of a "species" shares forever.

**Architecture implication (confirmed):** since traits mutate and cross-breed, they can't live as hard-coded fields on one subclass per species. The shape is a single `LifeForm` class (or a thin inheritable base) that is *configured* by a genome at construction time, rather than a JS subclass per species. Reproduction becomes "derive a new genome from parent genome(s) and construct a new instance," not "instantiate the same subclass again." This revises `Initial-requirements.txt` item 3d/4 (one class per life type).

### Genome encoding (bit-string)

Per developer idea: genes as bits, similar to real life — different bit combinations produce different attributes, offspring get a mix of both parents' bits, some attributes span multiple bits, and some attributes deliberately overlap bit positions with each other.

- **Storage**: genome is a fixed-length bit string, represented as a **hex string** for storage/save-load/display (compact, human-inspectable), parsed into a `BigInt` for the actual bit math. Plain JS numbers only support 32-bit bitwise ops; `BigInt` supports `&`, `|`, `^`, `<<`, `>>` at any length, so it's the right tool once the genome grows past ~32 bits (which it will, across this many traits).
- **Gene map**: a single data table (not scattered code) defines every trait as `{ name, bitStart, bitLength, decode }`. `decode(rawInt)` turns the extracted bits into a usable value — a linear-scaled range (e.g. `speed`: 4 bits → 0.5–3.0), an enum lookup (e.g. 2 bits → one of 4 `movementPattern` values), or a boolean flag (1 bit → has-flagella). This table is the actual definition of "what a gene combination means," and it's the natural place to plug in the visual parameters from §7 too, so appearance is decoded from the same genome as behavior.
- **Multi-bit attributes**: just give the trait a wider `bitLength` in the gene map for finer resolution (e.g. `size` at 6 bits instead of 2).
- **Deliberate bit overlap**: some trait ranges share bit positions on purpose — e.g. `size` = bits 8–13 and `speed` = bits 11–16, so bits 11–13 feed both. Flipping a shared bit moves two traits at once, which is exactly the "interesting" coupling described: it creates emergent tradeoffs (can't mutate toward faster without also nudging size) without hand-coding a correlation rule. Recommend keeping overlaps **curated, not random** — a handful of deliberately chosen shared ranges between traits meant to be linked — since a fully-random layout risks silently entangling traits that were never meant to correlate (e.g. `lifespan` accidentally riding on the same bits as `diet`), which makes balancing much harder to reason about.
- **Mutation moves to the genome level**: flip each bit with some small independent probability (standard GA point mutation) rather than each trait carrying its own mutation rate. This is simpler, and it's exactly why overlapping bits create interesting cascades — one flipped bit can shift every trait that reads that bit position.
- **Crossover (reproduction) also happens at the bit level**: pick a style — single-point (everything before bit *k* from parent A, everything after from parent B) or uniform (each bit independently from A or B) — and apply it to the two parents' genomes, then run mutation on the result. Because trait ranges can overlap, a crossover point landing inside a shared region naturally blends both traits from both parents. This delivers "offspring gains attributes from each parent" directly, with the overlap doing double duty as a built-in linkage mechanism — no separate per-trait blending logic needed.

**Haploid vs. diploid:** decided to go haploid for v1 — one bit string per organism, combined via crossover as above. A diploid model (two bit strings per organism, one per parent, with a dominance/blend rule per trait to decide what's expressed) would unlock recessive traits that vanish for a generation and reappear later, which is a neat real-biology feature, but it's real added scope — a dominance rule per trait, plus an "expressed vs. carried" distinction that would need to show up in the inspector UI too. Worth treating as a v2 idea rather than building into the first pass.

**Suggested bit budget: 64 bits total.** Per-trait resolution saturates well before 8 bits (a trait rarely needs more than 16–64 distinct levels for its variation to be perceptible), so total variety mostly comes from the number of traits and how overlaps are arranged, not from making individual traits wider. 64 bits also serializes to a clean 16-character hex string.

| Trait | Bits | Notes |
|---|---|---|
| movementPattern | 3 | enum, up to 8 patterns |
| speed | 5 | 32 levels |
| dietType | 3 | enum (nutrient/predator/scavenger/etc.) |
| foodPreference | 3 | scalar, e.g. prey-size preference |
| senseRadius | 4 | 16 levels |
| growthRate | 4 | 16 levels |
| reproductionType | 2 | asexual/sexual/either + reserved |
| reproductionCooldown | 4 | 16 levels |
| reproductionCost | 3 | 8 levels |
| offspringCount | 3 | 8 levels |
| lifespan | 5 | 32 levels |
| size | 6 | 64 levels — extra resolution since it's visually prominent |
| hue/color | 5 | 32 hue steps |
| saturation/brightness | 3 | |
| body shape variant | 3 | |
| appendage count | 3 | |
| appendage length/style | 3 | |
| texture/pattern | 2 | |
| **total** | **~64** | leaves a little slack for overlap regions |

Not a hard ceiling — since the genome is just a hex string + `BigInt` + a gene-map table, growing to 96 or 128 bits later (to add more traits) is a config change, not an architecture change. 64 bits is a "comfortable for v1, room to add a few traits before the length needs to grow" starting point.

**Curated overlap pairs (v1):** rather than let overlaps land randomly, anchor them to real trade-offs so the genome reads as a coherent "life strategy," not a pile of unrelated dials:
- `size` ↔ `speed` — bigger costs mobility (mass/drag trade-off).
- `growthRate` ↔ `lifespan` — fast growth, short life (the r/K-selection axis from ecology; produces boom-and-bust vs. slow-and-persistent lineages without extra rules).
- `size` ↔ `offspringCount`/`reproductionCost` — bigger organisms invest more per offspring, and have fewer of them (reinforces the same r/K axis rather than adding an unrelated one).
- `appendageCount` (visual, §7) ↔ `senseRadius` (behavioral) — links a visual trait to a behavioral one, so the SVG rendering is actually informative (more sensory appendages hints at better sensing) rather than purely decorative.

Three or four overlaps is the right count for v1 — enough for the genome to feel coupled and alive, not so many that it's hard to reason about which bits drive what.

**Crossover style: uniform, not single-point.** With bit-string overlap, coupling survives either crossover style — an overlapping bit is one physical bit, so every trait reading it inherits from whichever parent that bit came from, regardless of crossover method. The real difference is mixing thoroughness: single-point crossover can hand one parent an entire unbroken block of traits, while uniform crossover (each bit independently 50/50 from either parent) mixes more evenly and matches "offspring gains attributes from each parent" better. It's also simpler to implement — a random bitmask and two bitwise ops: `child = (mask & parentA) | (~mask & parentB)`.

Note: because crossover operates per-bit across the whole genome (not per-trait), trait bit-widths do **not** need to be even. Mixing already happens at a finer grain than "one trait, split in half" — each bit is an independent coin flip regardless of which trait it belongs to. A trait occasionally coming through entirely from one parent (more likely for narrow traits) is an expected outcome of that randomness, not a bug — consistent with real chromosomal crossover, where a short gene can end up inherited whole if the recombination point falls outside it. Mixing outcomes are treated as arbitrary by design; any resulting weirdness is fine to work through later once there's a running system to observe.

### Interaction / physics
- `radius`/`hitbox` — for collision and feeding/predation checks
- `mass` (optional) — if the soup ever has currents or collisions that should respond differently by size

### Lifecycle hooks
- Matches the requirements doc's constructor/destructor note: `onSpawn`, `onDeath` (e.g. return biomass to soup as nutrients), `onReproduce`.

## 6. Soup / Environment Data to Track

- `tick` — current simulation step count
- `bounds` — width/height of the soup world (may be larger than the visible viewport)
- `nutrientField` — distribution of ambient food across the soup (grid or particle-based)
- `environmentParams` — temperature, current/drift, light — whatever knobs the side panel exposes
- `population` — live count per species, for the legend and any balancing/caps
- `camera` — pan offset + zoom level (see §4)
- `entities` — the live collection of all life objects, likely spatially indexed (grid buckets) once populations get large, to keep neighbor/collision checks cheap

## 7. Visual Representation

- Organisms render as SVG, not primitive circles — single-cell or simple multi-part structures (body + appendages, spots, flagella, etc.) so each one reads as a distinct little creature.
- Build each creature from a small library of reusable SVG parts (`<symbol>`/`<use>`: body shapes, appendages, eye-spots, textures) assembled/parameterized rather than hand-drawn per organism. This keeps the art data-driven, which pairs directly with §5's genome: visual parameters (size, color, appendage count/length, body-shape variant) can derive straight from genome traits, so mutation and cross-breeding produce visually distinct offspring automatically, with no hand-authored art needed per variant.
- **Asset approach: hybrid, hand-built + procedural.** A small hand-built `<symbol>` library covers the genuinely categorical parts (body archetype, appendage style — already enum-decoded from a few genome bits, e.g. 8 body shapes × 8 appendage styles). Continuous procedural transforms layer on top — scale, hue, rotation, appendage count/length/angle — driven directly by trait values via `<use>` transforms and fill/stroke attributes. This gets real variety from the combinatorics without needing a full procedural-geometry engine on day one, and it's a clean upgrade path later: since the renderer treats "visual params derived from genome" as one isolated function, swapping in fully procedural path generation later is a change inside that function, not a rearchitecture.

### Renderer: SVG first, canvas-ready by design

Decision: build the renderer as SVG initially (population is expected to start small while the core simulation is worked out), but architect it so a canvas renderer can be swapped in later without reworking the simulation or interaction logic. That only holds if the rendering layer stays isolated from day one:

- **Organisms never own their DOM node.** A `LifeForm` holds state (position, genome) only — it doesn't hold a reference to "its" `<use>` element or mutate it directly. A separate renderer module reads all organism state each frame and draws it. Swapping renderers later means swapping this one module.
- **Visual params are data, derived from genome — not hand-authored per-organism markup.** Body shape/size/color/appendage config come from trait values via a shared function, so either renderer (SVG or canvas) can consume the same output.
- **Shapes authored as SVG `<path d="...">` data are reusable in canvas as-is** via `new Path2D(dString)`, so nothing drawn early is wasted if/when the switch happens.
- **Camera (pan/zoom) is a single global transform**, not baked into each organism's coordinates — `viewBox`/group transform in SVG, `ctx.setTransform` in canvas. One place to change, not N.
- **Selection/hit-testing is coordinate-based from the start**, not "attach a click listener to this SVG element." Click/hover resolves by testing the point against organism positions/radii (using the spatial index from §6), exactly like canvas will need. This is the one piece that's easy to accidentally couple to SVG-only behavior, so it's called out explicitly.

### Population — start small, grow as the system matures

No target population number has been set yet — that's fine, deliberately left open until there's a working simulation to observe. Working assumption: start with a small population (tens to low hundreds) while the core soup/organism/genome system is being built and tuned, and only push population higher once that system is solid. If/when population growth starts costing real frame time (rough SVG guidance from earlier discussion: comfortable to a few hundred organisms given multi-part creatures, costly by roughly 1,000–2,000 SVG elements, unusable past ~5,000), that's the trigger to swap in the canvas renderer built to the same interface — not something to solve preemptively now.

## 8. Gene Map (v1, implemented)

Concrete bit layout, implemented in `src/classes/Genome.js`. Bit 0 = least significant bit. Overlap columns show which other trait shares bits with this one.

| Trait | Bits | Kind | Range / values | Overlaps with |
|---|---|---|---|---|
| movementPattern | 0–2 | enum | drift / randomWalk / seekFood / seekMate / flee / schooling / ambush / idle | — |
| dietType | 3–5 | enum | photosynthetic / detritivore / herbivore / predator / omnivore / scavenger / filterFeeder / parasite | — |
| foodPreference | 6–8 | linear | 0–1 | — |
| reproductionType | 9–10 | enum | asexual / sexual / either / budding | — |
| reproductionCooldown | 11–14 | integer | 30–240 ticks | — |
| bodyShapeVariant | 15–17 | enum | 8 hand-built body symbols | — |
| texturePattern | 18–19 | enum | plain / spotted / striped / mottled | — |
| saturation | 20–22 | linear | 0.3–1.0 | — |
| hue | 23–27 | linear | 0–360° | — |
| senseRadius | 28–31 | integer | 20–140 px | appendageCount (bits 30–31) |
| appendageCount | 30–32 | integer | 1–8 | senseRadius (bits 30–31) |
| growthRate | 33–36 | linear | 0.05–0.5 | lifespan (bits 35–36) |
| lifespan | 35–39 | integer | 200–2000 ticks | growthRate (bits 35–36) |
| speed | 40–44 | linear | 0.2–3.0 px/tick | size (bits 43–44) |
| size | 43–48 | integer | 4–40 px radius | speed (bits 43–44), reproductionCost (bits 47–48) |
| reproductionCost | 47–49 | linear | 0.1–0.6 (energy fraction) | size (bits 47–48) |
| offspringCount | 50–52 | integer | 1–8 | — |
| appendageStyle | 53–55 | enum | 8 appendage styles | — |
| proclivityToProcreate | 56–59 | linear | 0–1 (mating eagerness) | — |
| *(reserved)* | 60–69 | — | unused, future headroom | — |
| compatibilityTag | 70–79 | raw | 0–1023, not a behavioral value | — |

Genome length is **80 bits** (20 hex chars) — grown from the original 64-bit budget to fit `proclivityToProcreate` and `compatibilityTag` without cramping. `Genome.random()`/`crossover()`/`mutate()` are all parameterized off `BIT_LENGTH`, so this was a config change, not a rewrite.

**`proclivityToProcreate`** is a behavioral eagerness dial, distinct from the already-existing `reproductionCooldown` (hard mechanical limit on frequency) and `reproductionCost` (energy cost): an organism able to reproduce may still not pursue it if this is low. Currently independent (no bit overlap with other traits) — linking it into the `growthRate`/`lifespan` r/K-selection cluster (short-lived organisms breed more eagerly) is a plausible future addition, not yet wired in.

**`compatibilityTag`** isn't a functional trait — it's a mate-recognition marker gating breeding, per developer idea. Two genomes are breeding-compatible if their tag segments are similar enough: `Genome.tagDistance(hexA, hexB)` computes the Hamming distance (bits that differ) between the two 10-bit tags, and `Genome.areCompatible(hexA, hexB, maxDistance)` thresholds it (default `COMPATIBILITY_THRESHOLD = 2`, tunable once there's a population to observe). Because the tag mutates and crosses over exactly like every other bit, compatibility **drifts across generations** — no hardcoded species logic is needed for reproductive isolation to emerge; closely related lineages stay compatible, and enough accumulated drift eventually splits a population into mutually-incompatible groups on its own.

**Implementation**: `Genome` class holds the genome as a 20-character hex string (parsed to `BigInt` for bit math), the `GENE_MAP` table above, `decode()`/`decodeAll()` for reading trait values, `Genome.random()` to seed new genomes, `Genome.crossover(a, b)` for uniform bit-level crossover, `Genome.mutate(hex, probability)` for point mutation, and `Genome.tagDistance()`/`Genome.areCompatible()` for the mate-compatibility check. The demo that exercises this end-to-end (two random genomes, tag compatibility, crossover, mutation) now lives at `genome-test.html`/`genome-test.js`/`genome-test.css`, reached from the game's Debug menu (§2) rather than being the app's `index.html` — `index.html` is the real game shell now (§1).

## 9. LifeForm & Soup (v1 implementation)

First functional slice: organisms exist, render in the soup, and can be clicked to inspect. **Movement, feeding, growth, and reproduction are not part of this slice** — this just gets organisms on screen and inspectable; behavior/simulation ticking is the next increment.

- **`LifeForm`** (`src/classes/LifeForm.js`): wraps a `Genome` with runtime state — `id`, `x`/`y` position, `age` (starts at 0), `state` (starts `'idle'`, not yet driven by any simulation loop). Decodes and caches all traits at construction (`this.traits = this.genome.decodeAll()`) since nothing mutates them yet in this slice. `destroy()` releases its genome.
  - `radius` — the genome's `size` trait as-is (4–40 abstract units, per §8's documented biology, unchanged).
  - `displayRadius` — `radius * LifeForm.VISUAL_SCALE` (`VISUAL_SCALE = 0.25`), the actual rendered/hit-tested pixel radius. Kept as a separate presentation-level concern rather than shrinking the genome's own `size` range: the genome describes biology, the renderer decides how many pixels a "size unit" is. Both rendering and click hit-testing use `displayRadius`, so what's drawn matches what's clickable.
- **`Soup`** (`src/classes/Soup.js`): holds `bounds` (width/height, in the same local coordinate space as the background art) and an `entities` array of `LifeForm`s. `spawnRandom(count)` creates `count` organisms with random genomes at random positions inside the bounds, inset so they don't spawn under the frame margin. `findEntityAt(x, y)` is the coordinate-based hit-test mandated in §7 — checks distance from `(x, y)` against each entity's position and `displayRadius`, returns the closest match or `null`. No per-tick update method yet — that's the next increment.
- **Rendering**: organisms render into `<g id="soup-layer">` inside `<svg id="soup">` (§1). Keeping the group's contents fully owned by the renderer function (not by `LifeForm` itself) matches §7's "organisms never own their DOM node / renderer stays isolated" principle. Each organism is a simple procedural placeholder — a circle at `displayRadius` colored by `hue`/`saturation`, with a handful of short lines radiating out per `appendageCount` — not yet the hand-built `<symbol>` library from §7; that's a follow-up art pass once the base system is proven.
- **Click-to-inspect**: a single click listener on the root `<svg id="soup">` (not one per organism, per §7's coordinate-based hit-testing decision, and not on the `soup-layer` group specifically since coordinate conversion needs the SVG root's `createSVGPoint`/`getScreenCTM`) converts the click's screen coordinates into the SVG's local coordinate space and calls `Soup.findEntityAt`. A hit populates the Inspector with the organism's live stats (age, position) plus its full decoded trait table and raw genome hex via the shared `renderGenomeTable` helper (§3/§8). Clicking empty soup clears the selection back to the Inspector's placeholder state.
- **Status bar**: population count now reflects `soup.entities.length` after spawning.

## 10. Simulation loop (v1): drift movement, Play/Pause/Step

Next increment after §9 — organisms actually move now. Scope deliberately narrow: **movement only**, no energy depletion, no starvation/death, and no per-`movementPattern` behavior differences yet.

- **`LifeForm.update(bounds)`**: per-tick movement. Every organism drifts regardless of its `movementPattern` trait value — distinguishing `seekFood`/`flee`/`seekMate`/`schooling`/etc. is deferred until there's something to react to (feeding, predation, mate-seeking aren't built yet), so implementing distinct behavior now would mean most patterns do nothing meaningful anyway. Drift is a gentle random walk: each tick, the current heading (derived from stored `vx`/`vy`) gets a small random perturbation, then velocity is recomputed from that heading at the trait's `speed` magnitude (so speed stays constant, only direction wanders) and added to position.
  - **Wall bounce**: when an organism's edge (`displayRadius`) would cross a bound, position is clamped to the boundary and the crossed axis's velocity component is reflected — organisms stay visibly inside the soup rather than sliding under the border. (The earlier "clip behind a wavy frame" idea was dropped in §1; this is the simple replacement — a hard bounce off a straight edge.)
  - `age` increments by 1 per tick. No energy/health change yet — that's a separate future increment once feeding exists.
- **`Soup.tick()`**: calls `update(this.bounds)` on every entity, increments `tickCount`.
- **Loop (`app.js`)**: a `requestAnimationFrame` loop runs continuously (always scheduling its next frame); an `isRunning` flag gates whether `soup.tick()` + `renderSoup()` actually happen that frame. Defaults to **running** on page load — organisms are moving as soon as you open the page, no click required.
- **Playback menu**: `Play/Pause` toggles `isRunning` and its own label; `Step` forces exactly one `tick()` + render regardless of `isRunning` (most useful while paused, harmless otherwise). `Speed` stays disabled/deferred — no tick-rate multiplier yet, 1 tick per animation frame.
- **Status bar**: `Tick` count and `FPS` (averaged over ~1 second, not per-frame — per-frame would be too jittery to read) are now live.

## 11. Death & reproduction (v1): lifespan expiry, simple asexual budding

Next increment after §10's movement-only loop, same "simplify first" pattern.

- **Death by lifespan only** — no energy/starvation system yet (needs a nutrient-field design per §6 that doesn't exist yet, so that's a further increment). `LifeForm.isAlive` is simply `age < traits.lifespan`. `Soup.tick()` sets `state = 'dead'` on expired organisms (so one you're actively inspecting shows that instead of silently freezing) before removing them and calling `destroy()`.
- **Reproduction: asexual/budding only, `sexual`/`either` deferred** — those two `reproductionType` values don't reproduce yet in this pass; that needs a mate-finding system (nearby-organism search + `Genome.areCompatible` tag check), which is a distinct future increment, not bundled in here.
- **Eligibility**, checked every tick per organism via `LifeForm.tryReproduce()`:
  1. `reproductionType` is `asexual` or `budding`.
  2. `age - lastReproducedAt >= reproductionCooldown` (a per-organism counter, not raw age, so reproduction spaces out correctly after the first time).
  3. `Math.random() < proclivityToProcreate` — the eagerness trait now actually does something: an eligible organism can still skip a given tick if this roll fails, rerolled every eligible tick until it succeeds.
- **Offspring**: exactly 1 per successful reproduction for v1 — `offspringCount` (1–8) isn't consulted yet; spawning up to 8 per event compounds population fast and is harder to verify in a first pass, so honoring it is a natural small follow-up once this baseline is confirmed to behave. Genome is `Genome.mutate(parent.genome.hex, LifeForm.MUTATION_RATE)` — copy-and-mutate, not crossover (crossing a genome with itself is a no-op) — matching §5's description of asexual reproduction. Spawns at a small random offset from the parent, clamped inside the soup.
- **Density-dependent regulation (soft carrying capacity), not a hard wall.** First pass, tested before shipping: with reproduction cooldowns as low as 30 ticks and no negative feedback yet (no energy competition, no predation), growth is exponential — a 20-organism seed population hit multiple gigabytes of memory within 3000 simulated ticks (~50 seconds of real play at 60 ticks/sec) before being killed. A hard reproduction cutoff at population 300 stopped the runaway but felt wrong: population would climb straight up against the cap and stop dead, nothing like a real ecosystem. Replaced with a `crowding = entities.length / Soup.CARRYING_CAPACITY` value (`CARRYING_CAPACITY = 300`, matching §7's "comfortable to a few hundred organisms" SVG rendering guidance), computed once per tick and applied two ways:
  - **Reproduction slows down as it fills up** — after an organism clears its own cooldown/proclivity checks, the attempt is additionally rejected with probability `crowding` (negligible rejection at low density, most attempts fail near/at capacity). A rejected attempt still consumes the parent's cooldown — the reproductive cycle "happened," it just didn't succeed — so effective birth rate falls off faster than a single flat roll would.
  - **Death gets more frequent as it fills up** — independent of natural lifespan expiry, every alive organism also rolls a `crowding² × Soup.OVERCROWD_DEATH_RATE` (`0.02`) chance per tick of dying from overcrowding stress. Squaring `crowding` keeps this negligible at low density and lets it ramp up sharply near/over capacity. `LifeForm.die()` sets a `forcedDeath` flag; `isAlive` checks both that and lifespan, so the death/removal code already in `Soup.tick()` needed no changes.
  - **`Soup.MAX_POPULATION` (600, 2× carrying capacity) stays as a hard backstop** — reproduction is unconditionally skipped past this point regardless of the soft rolls above, purely so mistuned constants can't reproduce their way back into the multi-gigabyte runaway already observed once. The soft model is what's meant to keep things stable near 300; the hard cap is a guarantee, not the intended mechanism.
  - Both `CARRYING_CAPACITY` and `OVERCROWD_DEATH_RATE` are starting guesses, not tuned values — expect to adjust once there's a running population to actually watch.
- **Status bar**: population count now updates every tick instead of once after initial spawn.

## 12. Organism View & Gene Map Visualization (v1)

A dedicated full-detail screen for a selected organism, reached from the Inspector, distinct from the always-running soup.

- **Trigger & pause behavior**: the Inspector gets a "View Organism" button (only shown when something is selected). Clicking it force-pauses the simulation if it wasn't already paused (`isRunning = false`, Play/Pause icon updates to match) and swaps the play-area's content from the soup `<svg>` to a new `#organism-view` panel. A "← Back to Soup" button inside that panel swaps back — **it does not auto-resume**; the sim stays paused until the user explicitly hits Play again, exactly as asked. Both panels live in `.play-area` simultaneously (one `hidden` at a time) — the menu bar, side panel, and status bar don't change.
  - **Play/Step are disabled while Organism View is open** (own addition, not explicitly requested, but needed): Organism View renders a paused snapshot, not something that live-updates. Since the toolbar's Play/Step buttons sit outside `.play-area` and stay reachable regardless of which panel is showing, leaving them enabled would let the sim tick silently behind the open Organism View — ticking organisms the user can't see, and leaving the open snapshot stale without any indication it's out of date. Disabled for the duration Organism View is open, re-enabled on "Back to Soup."
- **Content**, built fresh from the currently-selected `LifeForm` each time the view is opened (no need to live-update since the sim is paused while it's showing):
  - A header row: stats (id, age, state, position) on the left, **an enlarged reference render of the organism itself** on the right, so there's a visual to match the data against — added after the first pass shipped without one.
  - **The graphical gene map** (see below), below the header row.
  - The full decoded trait list and raw genome hex, reusing the existing `renderGenomeTable` helper rather than building a second copy of that display.
- **Organism reference render**: reuses the same drawing logic as the soup renderer rather than duplicating it — `renderSoup.js`'s per-organism drawing was factored out into a standalone `renderOrganism(entity, cx, cy, radius)` (an explicit-parameters pure function, not reading `entity.x`/`entity.y`/`displayRadius` directly), so both the soup (`renderSoup`, passing the entity's real position/`displayRadius`) and the reference view (`renderOrganismReference`, passing a fixed center point and a magnified radius) call the same code. Magnified because organisms in the soup render at `displayRadius` (~1–10px, tuned for the crowded soup view, §9) — too small to be a useful "reference" at a glance — so the reference view scales radius up by a fixed factor (`REFERENCE_SCALE = 4`) with a floor (`REFERENCE_MIN_RADIUS = 10`) so even the smallest organisms are clearly visible in the close-up.
- **Part-level animation**: see §13 — implemented as a follow-up the same session, once it became clear the rendered shape had no independent motion of its own.

## 13. Appendage & Body Animation (v1)

Per developer request: several distinct, independently-combinable animation types, driven by genetics rather than universal/identical across all organisms.

**Design decision — reuse `appendageStyle`, don't grow the genome further.** The gene map (§8) already has an 8-value enum (`appendageStyle`) reserved for exactly this kind of "how does this organism's appendages behave" question, previously unused in rendering (all appendages drew identically regardless of style). Rather than allocate new genome bits for animation parameters — a bigger, riskier change to make without the developer available to sanity-check it live — animation behavior is derived entirely from this existing trait via a lookup table in the renderer. This keeps the genome/bit-length work (§8) untouched and treats "how to animate a given style" as a rendering decision, consistent with §7's "visual params are data, derived from genome, interpreted by the renderer" principle.

**Four independent animation axes**, combinable per style:
- **Sway** — angular oscillation around the appendage's rest angle, in place (a wag).
- **Travel** — the appendage's base angle itself drifts. Two distinct behaviors depending on range: a *small* range oscillates back and forth (like sway, but of the anchor point itself, not just the tip); a *full* range (2π) continuously rotates all the way around the body instead of oscillating — matching "back and forth a small distance or travel the entire body" as two qualitatively different motions, not one parameter scaled up.
- **Wave** — length modulation, independent of position (an organism can travel/sway *and* wave at the same time, or wave while otherwise static) — fast frequency, small amplitude, like a cilium flick.
- **Stretch** — also length modulation, mechanically the same lever as wave but slow frequency, large amplitude — a reach in/out rather than a flick. Modeled as two separate oscillation terms multiplied together rather than a single "length" mechanic, since the qualitative difference (fast/small vs. slow/large) is what makes them read as different behaviors.

**`appendageStyle` → profile table** (in `src/ui/renderSoup.js`, not `LifeForm` — this is rendering interpretation, not simulation state):

| Style | Sway | Travel | Wave | Stretch | Reads as |
|---|---|---|---|---|---|
| style0 | — | — | — | — | Static, no motion (a valid baseline) |
| style1 | ✓ | — | — | — | Gentle wag in place |
| style2 | small | small | — | — | Small back-and-forth reach |
| style3 | — | full (2π) | — | — | Continuously orbits the body |
| style4 | — | — | ✓ | — | Fast flick, doesn't move |
| style5 | ✓ | — | ✓ | — | Wags and flicks together |
| style6 | — | small | ✓ | — | Reaches back and forth while flicking |
| style7 | ✓ | — | — | ✓ | Gentle wag with a slow reach in/out |

**Body throb**: separate from appendages — the body circle's rendered radius oscillates by an amplitude tied to `growthRate` (0.05–0.5, §8) times a small fixed scale, so faster-growing organisms visibly pulse more — a thematic reuse (growth ↔ pulsing) rather than an arbitrary trait pick.

**Speed scaling**: every oscillation's angular velocity is multiplied by the organism's `speed` trait, so faster organisms animate more energetically overall — another thematic trait reuse rather than a new dedicated parameter.

**Per-appendage and per-organism phase variety**: each appendage's phase offset includes its own index and the organism's `id`, so appendages on one organism don't move in perfect unison (reads as a ripple rather than a single rigid unit), and different organisms sharing a style don't animate in lockstep with each other.

**Timing source**: `renderOrganism`/`renderSoup` take a `time` parameter (from the rAF timestamp already available in `app.js`'s loop). Soup rendering is gated by the same `isRunning`/render-call structure as everything else — **appendages freeze when the sim is paused** for organisms in the soup.

**Revised: Organism View's reference render does animate**, via its own independent `requestAnimationFrame` loop, separate from the main sim loop. The first pass left it static (`time = 0`) reasoning that Organism View is an intentional paused snapshot — but that missed the actual point of the feature: Organism View is specifically where you go to look closely at one organism, so freezing the one visual proof that its animation genetics are doing anything was a real gap, not a safe simplification. Fixed properly instead of left as a known limitation:
- `renderOrganismReference(entity, time)` now accepts a `time` argument (default `0`, so any other caller that doesn't care about animation is unaffected).
- `app.js`'s `showOrganismView` starts a dedicated rAF loop that only re-renders the small reference SVG (not the gene map or trait table, which don't depend on time) each frame.
- That loop is explicitly cancelled (`cancelAnimationFrame`) both when "← Back to Soup" is clicked and at the start of opening a *different* organism's view, so it can't leak or end up with two loops racing if you view one organism, go back, and view another.
- The organism's underlying data (age, position, traits) still doesn't change while Organism View is open — the sim is genuinely paused — only the cosmetic appendage/body animation keeps running, the same way a game character might idle-animate while a pause menu is open.

## 14. Energy & Feeding (v1)

First energy system. Deliberately narrow scope: **passive ambient feeding only, no spatial nutrient field or foraging/predation yet** — that's the natural next step once this baseline is confirmed to behave, not bundled in here (a real nutrient field per §6 is a bigger, separate piece of work).

- **`energy`**: a new `LifeForm` field, range `[0, 1]`, clamped every tick. All organisms — fresh random spawns and reproduction offspring alike — start at `LifeForm.STARTING_ENERGY = 0.6`, not full, so there's an immediate, real energy trajectory to observe rather than everyone starting topped up.
- **Metabolism (depletion)**: every tick, `energy -= LifeForm.BASE_METABOLISM_RATE × size` — bigger organisms cost more to maintain, a direct, defensible reuse of the `size` trait rather than a flat rate for everyone. `BASE_METABOLISM_RATE = 0.0002` is a starting guess (same status as the other tunable constants in §11/§13): at the genome's average size (~22) that's roughly 0.0044/tick.
- **Feeding (regen), diet-dependent**: rather than a spatial nutrient field (deferred), every tick each organism also passively gains energy at a rate depending on `dietType`:
  - `photosynthetic` organisms regen at `LifeForm.PHOTOSYNTHETIC_REGEN_RATE = 0.005` — slightly above the average metabolic cost above, so a typical photosynthetic organism is roughly self-sustaining or slowly net-positive without needing to find anything, which matches how photosynthesis actually works (ambient light, available anywhere).
  - Every other `dietType` (`detritivore`, `herbivore`, `predator`, `omnivore`, `scavenger`, `filterFeeder`, `parasite`) regens at `LifeForm.OTHER_DIET_REGEN_RATE = 0.002` — well below average metabolic cost. This is an honest placeholder, not a balanced mechanic: those diets are supposed to require actively finding something (dead matter, plants, prey, filtered particles, a host), which doesn't exist yet, so for now they're at a real, expected disadvantage and will generally trend toward starvation over time unless small enough that their metabolism is low. **This is expected v1 behavior, not a bug** — the population should skew toward photosynthetic organisms surviving longest until real foraging/predation exists to let the other seven diets actually earn their keep.
- **Starvation death**: `LifeForm.isAlive` now also requires `energy > 0`, alongside the existing lifespan/`forcedDeath` checks (§11) — `Soup.tick()`'s death/removal logic needed no changes, same pattern as when overcrowding death was added.
- **`reproductionCost` finally consumed** — deferred explicitly in §11 ("ignoring mate-finding/energy cost for v1"), now wired up now that energy exists: `LifeForm.tryReproduce()` requires `energy > reproductionCost` to even attempt reproduction, and deducts `reproductionCost` from the parent's energy on a successful attempt. Reproduction is therefore now gated by cooldown, proclivity, crowding, *and* energy reserves together.
- **Inspector / Organism View stats** now show energy (as a percentage) alongside age/state/position.
- **Interaction with §11's density regulation**: this adds a third death pressure (starvation) on top of lifespan expiry and overcrowding, and a fourth reproduction gate (energy) on top of cooldown/proclivity/crowding — expect the population to trend smaller and more photosynthetic-skewed than the §11 test run until foraging/predation exist for the other diets. Verified via an extended Node run before shipping (same practice as §11) to confirm this settles rather than crashing to zero or misbehaving numerically.

## 15. Foraging & Predation (v1)

Closes the gap §14 explicitly flagged: the other diet types were placeholder-fed at a rate below average metabolism, with no real way to do better. This gives 6 of the 8 diet types an actual mechanism; 2 stay deferred on purpose.

- **Scope**: `photosynthetic` is unchanged (already fine, §14). `parasite` is **explicitly deferred** — feeding off a living host without necessarily killing it is a distinct mechanic from either "eat a static resource" or "kill and eat prey," and modeling it properly needs its own design (attach-to-host, drain-over-time), not a variant of what's built here. The remaining 6 split into two groups:
  - **Nutrient-eaters** (`detritivore`, `herbivore`, `omnivore`, `scavenger`, `filterFeeder`) — feed from scattered nutrient particles in the soup.
  - **Predators** (`predator`, `omnivore`) — feed by consuming smaller nearby organisms. `omnivore` deliberately gets both mechanisms (it's meant to eat anything).
- **Nutrient particles** (`Soup.nutrients`, each `{x, y}`): `Soup.NUTRIENT_COUNT = 40` scattered at random positions at construction. Each tick, every alive nutrient-eater checks distance to each particle; within `displayRadius + Soup.NUTRIENT_RADIUS` (`4`), it's consumed — the organism gains `Soup.NUTRIENT_ENERGY` (`0.3`) via a new `LifeForm.feed(amount)` method, and the particle is removed. At most one particle consumed per organism per tick. Depleted particles aren't instantly replaced — each tick, if below `NUTRIENT_COUNT`, there's a `Soup.NUTRIENT_RESPAWN_CHANCE` (`0.1`) chance of one respawning at a random position, so the supply regenerates at a bounded rate instead of being trivially abundant — real scarcity/competition among foragers, not an infinite buffet.
- **Predation**: each tick, every alive predator-diet organism checks other alive organisms for one that's *strictly* smaller (`prey.displayRadius < predator.displayRadius` — no equal-size or larger prey, which also keeps same-size organisms from mutually consuming each other) and within reach (`predator.displayRadius + prey.displayRadius`). On a hit: predator gains `Soup.PREDATION_ENERGY_GAIN` (`0.4`) via `feed()`, prey dies via the existing `LifeForm.die()`/`forcedDeath` mechanism (§11) — `Soup.tick()`'s death/removal code needed no changes, same pattern as every death cause added so far. At most one meal per predator per tick; a `Set` of already-eaten IDs prevents two predators claiming the same prey in one tick, or a predator eating something a faster predator already claimed that tick.
- **Deliberate simplification — prey isn't diet-restricted**: any smaller organism is fair game to any predator-diet organism, regardless of either one's `dietType` (so predators can eat other predators, or organisms of any diet, purely based on size). A real food-web (which diets can eat which) is a materially bigger design task (explicit predator-prey compatibility rules) than this pass's scope; flagged here rather than silently assumed. (**Cannibalism specifically was later ruled out — see §30.**)
- **Rendering**: nutrient particles render as small circles in a new `<g id="nutrient-layer">`, placed before (visually underneath) `soup-layer` in `#soup` so organisms draw on top of them — otherwise a mechanic with no visible representation isn't really "shown," consistent with how every other system change so far has come with something to look at.
- **Known scaling limit, not a bug**: both loops are O(entities × nutrients) and O(entities²) respectively — trivial at current population sizes (a few hundred) but would need the spatial indexing already flagged as a future need in §6/§7 if population grows much further. Not addressed now since it isn't a problem yet.
- **Verified before shipping** (same practice as §11/§14): a 5000-tick run confirmed no crashes/NaN/negative energy, and plausible predator/prey dynamics. It also surfaced a real problem, caught before shipping rather than after: with only `photosynthetic` reliably self-sustaining right now, a random 30-organism seed with few/no photosynthetic organisms can crash to near-single-digit population before reproduction/mutation happens to reintroduce `photosynthetic` genes and recovery kicks in. Fifteen independent trials produced zero outright extinctions, but the closest came down to **5** — and since there's currently no in-game way to reseed the soup if population ever hits exactly 0 (the "New Soup" menu item is still an unimplemented placeholder), that would be a permanently dead, empty soup with no recovery path.
- **Fix: `Soup.RESEED_COUNT` safety net** — if `entities.length` reaches 0 at the end of a tick, `Soup.tick()` automatically spawns `Soup.RESEED_COUNT` (`10`) fresh random organisms. This never activates under normal conditions (every test trial recovered well above zero on its own) — it's a backstop against the specific failure mode just observed, not a substitute for the real fix, which is giving the other 7 diets a fairer chance (better foraging/predation balance, or simply raising the initial seed population) once there's more data on how this plays out.

## 16. Population View & Direct-to-Detail Selection (v1)

Two related UX problems raised together: the side-panel Inspector was doing double duty as both "quick glance at what's selected" and "full detail dump" — the latter meant the full trait table + gene data got crammed into a 390px column, requiring scrolling to see much of it. And the Population panel-block had been a "coming soon" placeholder since §1 with no way to actually browse the population.

- **Clicking an organism in the soup now opens Organism View directly**, instead of first filling the side-panel Inspector with the full trait table and requiring a second click on "View Organism." The Inspector no longer needs to hold the full detail dump, since Organism View was already built with room to breathe (§12) — reusing it, rather than building a modal as a second, parallel UI pattern for the same content, was the deciding factor.
- **The Inspector panel-block shrinks to a compact, still-live summary** (id, age, energy, position — no trait table) plus a "View Organism" button, so there's a quick way back into full detail without re-clicking the (often tiny) organism in the soup, after returning via "Back to Soup."
- **Population View — a third play-area view state, not a new sidebar column.** Reuses the same swap mechanism as Organism View (`enterDetailView()`/`exitDetailView()`, factored out of the pause/disable/hide logic that both views need) rather than reworking the CSS grid to add a persistent right-hand region — lower risk, and consistent with the one UI pattern already established for "leave the soup to look at something in detail."
  - Triggered by a new "View Population" button replacing the Population panel-block's old placeholder text.
  - Organisms are grouped by `dietType` — the only real categorical "type" that currently exists (no hard species boundary yet, §5's `speciesTag`/`lineageLabel` blur on purpose) — each group sorted by size, largest first, with a count in its heading.
  - Each organism renders as a small clickable colored swatch (hue/saturation from its traits, no appendages/animation — a full reference render per organism isn't necessary or performant at population-view scale) in a wrapping grid under its group. Clicking one opens Organism View for that organism directly.
  - **Pauses on entry, same as Organism View, and for the same reason**: without pausing, the population could shift (births/deaths) while browsing the grouped list, which would either go stale or need constant re-grouping mid-browse. Consistent, not a new rule.
  - **Sort mode selector, added after positive feedback on the type-grouped view**: a small button row (Type / Age / Size) at the top of Population View. "Type" is the original grouped-by-`dietType` view above. "Age" and "Size" abandon grouping entirely and show one flat, wrapping grid of every organism sorted by that attribute (oldest/largest first) — grouping by diet doesn't add anything when the sort key is age or size, so those modes intentionally don't keep it. Every swatch's hover tooltip shows id, diet, age, and size regardless of mode, so switching modes doesn't lose the other attributes. The current mode persists across opening/closing the view (a module-level variable, not reset each time) since re-picking your preferred sort every time you reopen it would be annoying. Interpreting "population size" from the request as each organism's own `size` trait, paired with "age" as the other per-organism sort key — a global population *count* isn't something individual swatches can be sorted by, so this seemed like the sensible reading; should be obvious from the UI if that's not what was meant.
  - **Play button doubles as "exit and resume"**: Play/Pause is no longer disabled while a detail view (Organism View or Population View) is open. Clicking it there does two things at once — exits back to the soup (same as "← Back to Soup") *and* resumes the sim — rather than requiring "Back to Soup" then a separate Play click. The icon is always showing ▶ (not running) whenever a detail view is open, since entering one always force-pauses, so there's no ambiguity about what clicking it there means. The explicit "← Back to Soup" buttons still work exactly as before (exit without resuming) — this adds a shortcut, it doesn't replace that path. `Step` stays disabled in detail views; "advance one tick" doesn't carry the same implied "return to the soup" meaning that pressing Play does.

**Tuning constants** (`TRAVEL_SPEED_BASE`, `SWAY_SPEED_BASE`, `WAVE_SPEED_BASE`, `STRETCH_SPEED_BASE`, `BODY_THROB_SCALE`, `BODY_THROB_SPEED` in `renderSoup.js`) are starting guesses, not tuned values — same status as `CARRYING_CAPACITY`/`OVERCROWD_DEATH_RATE` (§11), expect to adjust once someone's actually watched it run.
- **Graphical gene map — a genome-browser-style horizontal track**, not a hand-wavy decoration:
  - Every `Genome.GENE_MAP` entry renders as a colored, rounded-rect segment positioned by its real `bitStart`/`bitLength` along a 0–79 bit axis — the diagram *is* the actual bit layout from §8, not an illustration of it.
  - **Overlapping traits get packed into separate lanes** (stacked rows) using interval-scheduling packing (place each trait in the first lane whose last occupant already ended before this trait starts, else open a new lane) — so `size`/`speed`/`reproductionCost` and the other overlap pairs don't visually collide. The payoff: an overlap is visible directly, with no special-case markup — if a given bit column shows color in two different lanes, those two traits share that bit, exactly like real genome-browser tracks show overlapping annotations.
  - **Per-bit shading within each trait's segment** — every individual bit cell inside a trait's rect is shaded by its actual 0/1 value (full opacity for 1, dimmed for 0), so the diagram shows the literal bit pattern, not just which trait owns which range.
  - **Colors are generated, not hand-picked** — evenly spaced hues across `GENE_MAP.length` (`hue = index / total × 360°`), so it automatically extends if traits are added later without needing a palette update.
  - **Labels**: trait name drawn inside the segment if it's wide enough to hold it; every segment (regardless of width) gets a native `<title>` tooltip with the trait name, current decoded value, and its bit range, so narrow segments (down to 2 bits) are still inspectable on hover without needing custom JS tooltip code.
  - Lives in its own file, `src/ui/renderGeneMapView.js` — a pure function of a genome hex string, independent of `LifeForm`/`Soup`, consistent with keeping rendering isolated (§7).
- **Icon buttons**: Play/Pause and Step in the top-menu toolbar (§2) switch from text labels to Unicode glyphs (▶/⏸ for Play/Pause, ⏭ for Step) — `aria-label` and `title` carry the text description now that the visible glyph doesn't.

## 17. Real Movement Patterns (v1)

`movementPattern` (§8) has been fully decoded but ignored since §10 — every organism drifted identically regardless of its value, deferred specifically until there was something to seek or flee from. §14/§15 (energy, feeding, predation) now provide that, so this wires up all 8 values.

- **`LifeForm.update` now takes `(bounds, soup)`**, not just `bounds` — movement decisions need spatial awareness (nearby food, threats, other organisms), which requires querying the soup's contents. `Soup.tick()` passes itself through. New query helpers on `Soup` — `findNearestEntity(x, y, maxDistance, predicate)`, `findNearestNutrient(x, y, maxDistance)`, `findEntitiesWithin(x, y, maxDistance, predicate)` — are additive; `forage()`/`predate()`'s existing, already-verified inline search loops are untouched rather than refactored onto the new helpers, to avoid risking a subtle behavior change in already-tested code for the sake of reuse.
- **Steering, not snapping**: when a pattern has a target to move toward or away from, heading turns toward the desired direction at a capped rate (`LifeForm.STEER_RATE` radians/tick) rather than instantly facing it — avoids visually jittery direction flips, especially when a target is directly behind the organism.
- **Sensing uses the existing `senseRadius` trait** (20–140, §8) as the search cutoff for every pattern below — nothing omniscient; an organism only reacts to what's actually within range, otherwise falls back to wander (§10's original drift behavior).

| Pattern | Behavior |
|---|---|
| `drift` | Unchanged from §10 — gentle random-walk heading, roughly constant speed. |
| `randomWalk` | Same mechanism as drift, larger per-tick heading perturbation (`LifeForm.RANDOM_WALK_WANDER` > `WANDER`) — more erratic, frequent direction changes rather than a gentle wander. |
| `seekFood` | Diet-dependent target: predator-diet organisms steer toward the nearest smaller organism in range (mirroring §15's predation eligibility check); nutrient-eater diets steer toward the nearest nutrient particle. `photosynthetic` has no discrete food source to seek, and any diet with nothing in range, falls back to wander. |
| `flee` | Steers away from the nearest larger predator-diet organism in range (the mirror image of `seekFood`'s predator case — same eligibility logic, opposite steering direction). No threat in range → wander. |
| `seekMate` | Steers toward the nearest *compatible* organism in range, via the existing `Genome.areCompatible` tag-distance check (§8) — implemented now for the movement behavior alone, even though sexual reproduction itself still isn't wired up (§11/§15 still defer it). Organisms cluster near compatible individuals; nothing eats/reproduces from this yet, that's the still-separate future feature. |
| `schooling` | Steers toward the average position of all other alive organisms in range (cohesion only — no separation/alignment terms, the simplest version of flocking, consistent with "simplify first" elsewhere in this doc). No neighbors in range → wander. |
| `ambush` | Applies the drift wander mechanism but at a drastically reduced speed (`LifeForm.AMBUSH_SPEED_SCALE = 0.1`, i.e. 10% of the trait's `speed`) — stays close to put rather than actively hunting, relying on prey wandering into its (still-active) predation range instead of chasing. |
| `idle` | No movement at all — position never changes. A valid, sessile strategy (a filter-feeder anchored in place, say), not a placeholder/bug. |

- **Performance**: adds another O(entities × entities) or O(entities × nutrients) pass alongside the existing predation/foraging loops (§15) — same known scaling limit already flagged there (fine at current population sizes, would need spatial indexing if that changes materially).
- **Verified before shipping** (same practice as §11/§14/§15): confirmed via Node that seekFood organisms actually close distance on nutrients/prey, flee organisms open distance from threats, ambush/idle organisms barely/never move, and the whole system runs an extended tick count with no crashes, NaN, or out-of-bounds positions.

## 18. Life & Death Visual Feedback (v1)

Two requests handled together since they're the same mechanism pointed in opposite directions: death should fade out (and leave something behind), birth should be obvious. Both ride on one opacity concept in the renderer rather than being two unrelated effects.

- **Death: fade out, then become a nutrient, not instant removal.** Previously, a dead organism vanished from `soup.entities` (and rendering) the same tick it died. Now: `LifeForm.deathTick` starts `null` (alive); the tick `isAlive` first goes false, `Soup.tick()` sets `state = 'dead'` and `deathTick = 0` instead of destroying/removing immediately. Each subsequent tick, `deathTick` increments; the corpse keeps rendering (frozen pose, no appendage/body animation — a dead thing shouldn't still be wiggling — at fading opacity, `1 - deathTick / LifeForm.FADE_TICKS`) until `deathTick` reaches `LifeForm.FADE_TICKS` (`45`, ~0.75s at 60 ticks/sec), at which point it's *actually* removed and destroyed, and **a nutrient particle spawns at its last position** — biomass returning to the soup. Applied uniformly to every death cause (lifespan, overcrowding, starvation, predation) rather than special-casing predation to skip it — a predator's kill still leaves a nutrient behind even though the predator already fed from it directly; not perfectly biologically precise, but consistent and simple, matching the "simplify first" pattern used throughout.
  - **Fading corpses don't act like they're alive.** They're excluded from `update()` (no more movement), `forage()`/`predate()`/reproduction eligibility (already true, since those all gate on `isAlive`, unchanged), `findEntityAt` (can't click-select a corpse), and Population View's grouping/sorting (corpses aren't real population members to browse). The one thing they still do is render, specifically so the fade is visible.
  - **Reseed safety net fix**: the §15 safety net checked `entities.length === 0`, but corpses now linger in `entities` while fading — a population that's biologically extinct but still has corpses fading out would never trigger it. Changed to a new `Soup.aliveCount` getter (`entities.filter(e => e.isAlive).length`), checked instead of raw array length. Status bar population and Population View's entity lists switch to `aliveCount`/an alive-filtered list for the same reason — corpses shouldn't inflate the population number or appear in the browsable list.
  - **Not implemented, deliberately**: corpses aren't a food source scavengers can actively seek/eat during the fade — they're a rendering effect that automatically becomes a nutrient once decomposition finishes, not an interactive object in the interim. Active corpse-scavenging (a nice fit for the `scavenger`/`detritivore` diets) is a reasonable future enhancement, not bundled in here.
- **Birth: fades in, plus a brief expanding "spawn" ring.** Mirrors death in the same rendering mechanism, opposite direction: `LifeForm.birthTick` starts at `0` (not `null`) and increments each tick, opacity ramping `birthTick / LifeForm.BIRTH_FADE_TICKS` (`20`, faster than the death fade — arriving reads better snappy, decaying reads better gradual) until it hits `1` and `birthTick` is cleared to `null` (fully born, normal opacity rules apply — i.e. `1` unless later dying). Applied to **every** new `LifeForm`, not just reproduction offspring — the initial seed population fades in on page load too, which reads as "the soup coming to life" rather than everyone just popping in; simpler than special-casing reproduction-only.
  - **Fade-in alone was judged too subtle to reliably notice** in a busy, populated soup, especially for a newborn that starts small. Added `Soup.birthEffects` (a list of `{x, y, tick}`, independent of `LifeForm`) — every reproduction event pushes one at the offspring's spawn point; each tick it grows and fades (`radius` increases, opacity decreases) over `Soup.BIRTH_EFFECT_TICKS` (`20`) ticks, then gets removed. Rendered in its own `<g id="birth-effect-layer">`, same pattern as the nutrient layer — a brief ring that's visible even before you'd notice the tiny new organism itself.
  - Since sexual reproduction ("two organisms" making one) isn't wired up yet (§11/§15/§17 all still defer it), this currently fires for every asexual/budding birth — the effect itself doesn't care how many parents were involved, so it'll apply unchanged whenever sexual reproduction does land.

## 19. Sexual Reproduction (v1)

Closes the last big reproduction gap — `sexual`/`either` organisms have never reproduced at all, and §17's `seekMate` movement pattern already steers compatible organisms toward each other with nothing to do once they arrive. This is that missing mechanic.

- **Two-tier distance, reusing the sense/contact split already established for predation and movement**: `seekMate` (§17) uses `senseRadius` to steer organisms toward a compatible partner from a distance; actual mating additionally requires *contact* (`displayRadius` sum, like predation's kill range) — sensing brings them together, touching is what triggers reproduction. Same two-tier pattern as predation, not a new concept.
- **Eligibility precomputed once per organism per tick, not re-rolled per pairwise comparison.** `LifeForm.canAffordReproduction()` (cooldown + energy + a `proclivityToProcreate` roll) is evaluated once to build the set of "seeking" organisms for the tick; the nested search for a compatible partner only rolls proclivity implicitly through that precomputed set, never re-invoking the check per candidate — otherwise an organism compared against many candidates in one tick would get multiple chances at the same random roll, silently favoring organisms in denser neighborhoods.
- **`Soup.matePairs()`**: for each "seeking" organism (alive, `sexual`/`either`, passed `canAffordReproduction()`), finds the *nearest* other seeking organism that's `Genome.areCompatible` and within `senseRadius`; if that nearest match is also within contact range, they mate — genome is `Genome.mutate(Genome.crossover(a.genome.hex, b.genome.hex), LifeForm.MUTATION_RATE)` (the uniform bit-crossover already designed for this back in §5/§8, not asexual's copy-and-mutate), offspring spawns at the parents' midpoint. Both parents call `recordReproduction()` (cooldown reset + cost deducted) **before** the crowding-rejection roll (§11) — cost is paid on a biologically successful match regardless of whether crowding then rejects the offspring, exactly the existing asexual pattern ("attempt succeeded, cooldown is spent either way"), not a new rule. A `matedIds` set (mirroring predation's `eatenIds`) prevents one organism pairing with two different partners in the same tick.
- **`either` falls back to asexual automatically, no special-casing needed.** `matePairs()` runs *before* the existing asexual `tryReproduce()` loop each tick. If an `either` organism mates sexually, `recordReproduction()` already reset its cooldown that same tick, so the asexual loop's own cooldown check naturally blocks it from also reproducing asexually — no explicit "already mated" flag required, the existing cooldown gate does the job. If no compatible/reachable mate was found, it reaches the asexual loop unmodified and can still bud. `LifeForm.tryReproduce()`'s type check widened from `asexual`/`budding` to also include `either`.
- **Refactored, not duplicated**: `tryReproduce()` (existing, already-verified asexual path) now shares `canAffordReproduction()`/`recordReproduction()` with the new sexual path, rather than the sexual path reimplementing the same cooldown/energy/proclivity logic separately. Re-verified the asexual path still behaves identically after the refactor, not just assumed.
- **Birth effects and offspring energy are unchanged** — sexual offspring get the same starting energy, fade-in, and spawn-ring treatment as asexual offspring (§18); the birth-effect code never distinguished parent count, so nothing needed to change there.
- **Verified before shipping** (same practice as §11/§14/§15/§17): confirmed via Node that a compatible, touching pair's offspring genome is a genuine mix (differs from a pure copy of either parent), that incompatible pairs don't mate even when touching, that both parents pay cooldown/energy on a successful match, that `either` correctly falls back to budding when no mate is available, and that nothing double-reproduces in a single tick — plus an extended run confirming overall stability with the new reproduction path active.

## 20. Status Bar: Genetic Diversity & Food Density (v1)

Two new status bar readouts, added together since one's cheap enough to update every tick and the other needs its cost bounded — worth being explicit about which is which.

- **"Diversity" — genetic diversity, not species/diet-type variety.** "Population diversity" is genuinely ambiguous (could mean how many diet types coexist, trait variance, etc.) — interpreted as genetic diversity specifically, since the genome is this project's central mechanic and there's already real machinery to measure it properly, rather than something superficial like a diet-type count (already visible in Population View anyway). Implemented as **average per-bit entropy** across the alive population's genomes — for each of the 80 bit positions, compute the fraction `p` of alive organisms with that bit set, then Shannon entropy `-(p·log2(p) + (1-p)·log2(1-p))` (0 if every organism agrees on that bit, 1 if the population is split evenly), averaged across all 80 positions and shown as a percentage. This is the same concept population genetics calls expected heterozygosity/gene diversity — a legitimate, standard measure, not an invented one. `Soup.calculateGeneticDiversity()`.
  - **Computed once per second, not every tick** — `O(80 × aliveCount)` is cheap, but doing it 60×/second for a number that only needs to be glanceable is unnecessary cost piled onto everything else already running per-tick (movement sensing, predation, foraging, mating are all already `O(n)`-to-`O(n²)`). Piggybacks on the same 1-second interval `app.js` already uses for FPS, rather than introducing a second timer.
  - A cheaper-but-cruder alternative (average pairwise genome Hamming distance across the population) was considered and rejected — it's `O(aliveCount²)` and would need to run every second at populations approaching the `CARRYING_CAPACITY` (300), whereas the per-bit entropy approach stays linear in population size.
- **"Food" — the current nutrient particle count**, `soup.nutrients.length`, shown plainly (no normalization/percentage) since the baseline (`NUTRIENT_COUNT = 40`) is already a familiar reference point and the number can legitimately exceed it once death-decomposition nutrients are added (§18). Cheap to read every tick, so it updates on the same cadence as `Tick`/`Population`, unlike diversity.

## 21. Hand-Built Organism Shapes (v1)

The upgrade §7 always intended: `bodyShapeVariant` (8 values, decoded since §8 but never once used in rendering — every body has been a plain circle) and `appendageStyle` (8 values, used since §13 only to pick an *animation* profile — every appendage has been a plain straight line regardless of style) now also drive actual silhouette shape, not just animation/color.

- **Procedural, not hand-drawn assets** — matches this project's existing pattern (colors generated from hue rather than picked, gene map segments colored by formula rather than by hand): each body shape is a small parametric function `angle -> {x, y}` (in unit-circle space, scaled by radius), sampled at N points and connected into a closed SVG path — not freehand bezier art. Lives in a new file, `src/ui/organismShapes.js`, kept separate from `renderSoup.js`'s render-loop/animation orchestration so "what does variant N look like" stays independent of "how is it animated this frame."
- **8 body shapes** (`bodyShapeVariant`), each a distinct point-sampling function: circle (baseline), oval (elongated ellipse), teardrop (tapered to a point via `1 - k·cos(a)`), bumpy blob (amoeba-like, low-frequency multi-sine perturbation), spiky star (high-frequency high-amplitude perturbation), bean/kidney (single asymmetric indent), pentagon (5-point sampling with no smoothing, giving straight angular edges instead of a curve), trefoil (3-lobed clover via `sin(3a)`). Deliberately chosen to be clearly distinguishable from each other at a glance — legibility (an organism's silhouette hints at its genome) mattered as much as variety.
- **8 appendage shapes** (`appendageStyle`), each a small element-builder from base point to the tip point §13's animation math already computes (angle/length unchanged — only *how the connection is drawn* changes, not the positions themselves): plain spike (unchanged baseline), beaded cilium (line + small tip circle), paddle/fin (line + small triangle), long thin whip (line + tiny tip), hooked flick (quadratic curve, not a straight line), frilly pair (two splayed lines instead of one), bulbed tentacle (line + larger tip circle), wavy elastic tendril (zigzag path). Stroke width now scales with the organism's radius (`max(0.5, radius × 0.08)`) instead of a fixed constant, so detail is proportionally visible at both the soup's small scale and Organism View's magnified reference render — the same shared `renderOrganism` function draws both, per §12's original reuse decision, so this upgrade applies to both automatically.
- **Scale-appropriate expectations, not a bug**: at the soup's actual `displayRadius` (~1–10px), fine details (triangles, bulbs, hooks) will barely register — that's expected, real organisms at that scale don't show fine morphological detail either. Organism View's 4×+ magnified reference render is where these are actually meant to be seen clearly.
- **No visual verification performed by the agent** — SVG path/element generation was checked structurally (valid coordinates, no NaN, correct element counts per style, via a fake-DOM harness), but the actual aesthetic result needs the developer's own look in a browser; unlike the CSS-driven soup/chrome work earlier in this doc, procedurally-generated path shapes aren't something reasoning about the code alone can confirm "looks good."
- **Corrected after developer follow-up: appendage shapes had slipped out of canvas-ready design.** The first pass's `buildAppendageElements` built real SVG DOM elements directly (`document.createElementNS`) — the body shape (`getBodyPath`, a plain `d` string) matched §7's portability promise correctly, but the appendage shapes did not, since a canvas renderer can't consume a DOM element the way it can consume a path string. Fixed by splitting the function in two: `getAppendageShape(...)` now returns plain geometry data (`{type: 'line'|'circle'|'polygon'|'polyline'|'quadratic', ...}`, no DOM at all) — the portable part a canvas renderer would consume unchanged — and a new `renderShapeCommandsToSVG(...)` is the *only* place that still touches `document.createElementNS`, converting that data to actual SVG elements. A canvas port would replace just the adapter, never the shape-geometry functions. Re-verified after the refactor that the SVG output is unchanged (same element types/counts per style) — this was a structural fix, not a visual one.

## 22. Growth Over Lifetime (v1)

Called out in the very first requirements doc ("how it grows") and never implemented — `size` has been a fixed value since birth, and `growthRate` (in the gene map since §8) has only ever driven §13's cosmetic body throb, never actual growth. Picked as the next feature autonomously (developer stepped back to watch the current build rather than pick from the list) since it closes a gap this old and reuses a trait that's been sitting half-used.

- **`traits.size` is now adult/mature size, not current size.** A new `LifeForm.currentSizeFraction` starts at `LifeForm.STARTING_SIZE_FRACTION` (`0.3` — newborns are 30% of their eventual adult size) and grows toward `1.0` every tick via `currentSizeFraction += growthRate × LifeForm.GROWTH_RATE_SCALE × (1 − currentSizeFraction)` — an asymptotic approach, not linear: fast growth early, leveling off near maturity, matching how real growth curves actually look, and naturally self-limiting (never overshoots `1.0` without a clamp needing to fight it).
- **`radius` (and everything downstream of it) is now growth-aware for free.** `LifeForm.radius` changed from `traits.size` to `traits.size × currentSizeFraction`; `displayRadius`, rendering, wall-bounce, predation eligibility (`prey.displayRadius < predator.displayRadius`), mating contact range, and hit-testing all already read from `radius`/`displayRadius` rather than `traits.size` directly, so every one of them became growth-aware without being touched individually — the getter-based design already in place paid for itself here.
- **A real emergent consequence, not incidental**: since predation eligibility now depends on *current*, not adult, size, a juvenile of a species that would be too large to prey on as an adult can still be eaten while young and small — youth is genuinely more dangerous than maturity, the way it actually is in nature, rather than an organism being permanently safe or permanently vulnerable based on its adult size alone.
- **Metabolism now scales with current size, not adult size** — `LifeForm.update()`'s metabolism calculation switched from `traits.size` to `this.radius` (current), so juveniles are cheaper to maintain than adults of the same genome. A deliberate, not incidental, choice: it gives young organisms a small energy cushion while they're also more predation-vulnerable, rather than stacking both disadvantages on them at once.
- **`GROWTH_RATE_SCALE = 0.03`** tuned (starting guess, not empirically fit — same status as every other tunable constant in this doc) so a mid-range organism (`growthRate` ≈ 0.27, the middle of its 0.05–0.5 range) reaches ~95% of adult size at roughly a third of an average lifespan, leaving a real stretch of "adult" life rather than growing for its whole lifespan or reaching maturity almost instantly. Slow-`growthRate` organisms (near 0.05) may still be growing when they die of old age — an intentional, realistic outcome of the trait's range, not a bug to correct.
- **Applies to every organism uniformly** — fresh `spawnRandom` seeds and reproduction offspring alike start at `STARTING_SIZE_FRACTION`, same pattern already used for §18's birth fade-in.
- **Verified before shipping** (same practice as every simulation-affecting change in this doc): confirmed via Node that `currentSizeFraction` stays within `[STARTING_SIZE_FRACTION, 1]` and asymptotically approaches `1` at the expected rate for a range of `growthRate` values, that a young organism can be preyed on by something that couldn't touch it once grown, and an extended run confirming overall stability with growth active.

## 23. Rendering Performance: DOM Element Reuse (v1)

FPS dropped noticeably after §21's shape upgrade — real, expected, not imagined. Per organism, the body went from a `<circle>` (3 numeric attributes) to a `<path>` sampled from up to 28 trig-evaluated points, and most of the 8 appendage styles emit 2 DOM elements instead of 1 — appendage element count roughly doubled. At ~200 organisms averaging ~5 appendages each, that's roughly 1,700 SVG elements, squarely in the "costly" 1,000–2,000 range §7 flagged as the point to reconsider the renderer — and `renderSoup` was destroying and recreating *all* of them from scratch every single frame regardless of whether anything about a given organism had actually changed.

**Chosen fix: stop tearing down and rebuilding, reuse elements instead of a canvas rewrite** — canvas would also fix this (and the portability refactor from §21's follow-up means it's ready to build whenever it's actually needed), but element reuse is a much smaller change and addresses the real waste directly: most organisms exist across hundreds or thousands of consecutive frames with a completely stable DOM *structure* (element count and types never change once an organism's `appendageCount`/`appendageStyle` are set at birth — those are genome traits, fixed for life) — only *attributes* (position, throb radius, appendage angle/length, opacity) need to change frame to frame.

- **`organismElementCache`** (`Map<entity.id, {group, body, appendages}>`) in `renderSoup.js` persists across calls. `renderSoup(soup, groupElement, time)` now: creates a cached DOM structure only the first time an organism is seen; every subsequent frame just updates that structure's attributes; removes and discards the cache entry for any id no longer in `soup.entities` (organism fully decomposed/gone, §18).
- **`organismShapes.js` split further** to make this possible without duplicating the attribute-setting logic between "create" and "update" paths: `applyShapeCommandToElement(el, cmd, color, strokeWidth)` is now the *only* place that sets attributes for a given command type, called both when an element is first created and every time it's updated afterward. `createElementForCommand(cmd)` makes the right empty element for a command type. `renderShapeCommandsToSVG` (unchanged public behavior, used by the one-shot reference view) and a new `updateShapeElementsFromCommands` are both just thin orchestration on top of those two.
- **`renderOrganism`/`renderOrganismReference` (Organism View's reference render) are unchanged** — they still create fresh elements every call. That's fine: Organism View only ever renders one organism at a time, so the DOM churn this section is fixing (hundreds of organisms, every frame) doesn't apply there; optimizing a single-element case wasn't worth the complexity.
- **A known caveat, not yet relevant**: the cache is a single module-level `Map`, correct for exactly one long-lived soup. If a "New Soup" reset is ever implemented (§2's `Simulation` menu still has it as a disabled placeholder), the cache will need to be cleared at that point — noted here so it isn't forgotten, not fixed now since the feature doesn't exist yet.
- **Verified**: structurally, via a fake-DOM harness, that a surviving organism's cached elements are the *same* element instances across repeated `renderSoup` calls (not recreated), that a newly-born organism gets elements created exactly once, and that a decomposed organism's cached elements are actually removed — plus confirmed the rendered attribute values are identical to what the pre-reuse code would have produced, since this needed to be a pure performance change, not a visual one.
- **Measured improvement: ~20% FPS at 500 food / full population** — real, but partial, because DOM reuse only removed the cost of *creating and destroying* elements; it didn't reduce the per-frame *computation* (trig-heavy path/geometry generation) or the `setAttribute` calls themselves (which still trigger SVG style/layout invalidation on a reused node, just not full node allocation). Two genuinely separate remaining costs, addressed in §24: geometry computation (renderer-agnostic — canvas wouldn't reduce this either, it's pure JS math) and SVG-specific per-attribute invalidation (which canvas *would* eliminate, since immediate-mode drawing has no retained tree to invalidate).

## 24. Rendering Performance: Cheaper Geometry (v1)

Two further, independent optimizations, chosen over a canvas rewrite for now since they're small, low-risk, and target the actual remaining cost directly.

- **Body-shape point counts roughly halved** (§21's `BODY_SHAPES`): 24→16 for the low-frequency shapes (circle, oval, teardrop, bean), 28→20 for the higher-frequency ones (bumpy blob, spiky star — kept higher since their `sin(a×5)`/`sin(a×7)` perturbations need enough samples to still read as bumpy/spiky rather than aliasing into a smoother, wrong-looking curve), 18→14 for the trefoil (lower frequency, `sin(a×3)`, needs fewer). Pentagon (`shape6`, 5 points) untouched — already minimal. This is the bigger lever of the two: the body path's point-sampling loop reruns in full every frame regardless of anything else, since an organism's position changes every tick — there's no way to throttle it away, only shrink it.
- **Appendage animation throttled to ~30 updates/sec, position tracking stays at full frame rate** — this needed care to avoid a real regression: `getAppendagePose`'s sway/travel/wave/stretch (up to 4 `sin()` calls per appendage) are now only recomputed when a time-quantized "animation bucket" (`Math.floor(t × 30)`) changes, caching the resulting angle/lengthScale on the organism's cache entry between updates — but the appendage *tip position* (`cx + cos(angle) × ...`) is still recalculated every single frame from the organism's *current* `cx`/`cy`, using whichever angle/lengthScale is cached. If both were throttled together, organisms would visibly stutter in position every other frame; because only the wiggle itself is throttled and position always uses current coordinates, movement stays perfectly smooth and only the appendage animation's update rate drops slightly (imperceptible at typical wiggle speeds). Body throb (`getBodyThrobScale`, 1 `sin()` call) shares the same throttle for the same reason — its result feeds into `bodyRadius`, which still gets threaded through a full, un-throttled body-path regeneration every frame.
- **Not done**: reducing `setAttribute` count itself, or moving to canvas to eliminate SVG's per-attribute invalidation entirely — both remain real, known options if this still isn't enough.
- **Verified**: confirmed the body shapes at reduced point counts still produce valid, non-degenerate paths (no self-intersection artifacts checked, but point count and coordinate validity confirmed) for all 8 variants, and specifically confirmed the position/animation decoupling — an organism's rendered tip position tracks its current `cx`/`cy` every single frame even on ticks where the cached angle/lengthScale wasn't recomputed, i.e. no stutter was introduced.
- **Measured result: worse, not better** — FPS dropped below 50 at *lower* population/food quantities than before this section's changes, a real regression rather than insufficient improvement. Best available explanation without being able to profile a real browser directly: SVG attribute mutation on geometry attributes (`d`, `points`) isn't necessarily cheaper than fresh element creation — some rendering engines have to fully reparse and rebuild internal path/geometry data on every mutation regardless of whether the node is old or new, so §23's "reuse" strategy may have been a wash or a net negative for content this path-heavy, independent of whatever this section's changes did or didn't help with. Rather than keep iterating on SVG-side guesses without the ability to measure directly, moved to canvas (§25) instead of a third SVG attempt.

## 25. Canvas Renderer for the Soup (v1)

Two rounds of SVG-side optimization (§23, §24) didn't recover performance — the second one measured *worse*. Rather than a third guess at SVG internals this agent can't profile, switched the soup to canvas, per the trigger condition §7 always described for exactly this situation.

- **Scope: only the soup's organism/nutrient/birth-effect rendering moves to canvas.** Organism View's reference render and the gene map diagram stay SVG — both only ever render one thing at a time (one organism, one gene map), so the DOM-churn problem this section addresses never applied to them; converting them would be pure unnecessary churn.
- **The §21 portability refactor paid off directly here** — `getBodyPath` already returned a plain SVG path `d` string (used via `new Path2D(d)` + `ctx.fill`/`ctx.stroke`, exactly as originally promised), and `getAppendageShape` already returned portable draw commands (`{type: 'line'|'circle'|...}`) rather than DOM elements. The actual migration was: write one new adapter (`drawShapeCommandsToCanvas`, in a new `src/ui/renderSoupCanvas.js`) that interprets those same commands via `ctx.moveTo`/`lineTo`/`arc`/`quadraticCurveTo` instead of `document.createElementNS`. The geometry-generating functions themselves — the part that would have been expensive to redo — needed no changes at all.
- **§23's DOM-element cache and §24's animation throttle were both removed, not ported.** Canvas has no persistent DOM tree to reuse in the first place — there's nothing to cache; every frame just issues fresh drawing commands directly, which is what canvas is fast at. Keeping the throttle was considered (the trig cost it targeted is renderer-agnostic, so it would still theoretically help), but a back-of-envelope estimate of the actual trig volume at typical population sizes (roughly ten thousand operations per frame, well within what a modern JS engine handles in a small fraction of a frame budget) suggested it wasn't worth the added complexity for a first canvas pass — simplicity first, add it back only if measurement says it's actually needed.
- **`<svg id="soup">` becomes `<canvas id="soup">`** — the `<g id="nutrient-layer">`/`<g id="soup-layer">`/`<g id="birth-effect-layer">` child elements go away entirely (canvas has no child elements, just a 2D context drawn into directly); `renderSoupCanvas(ctx, soup, time)` clears and redraws nutrients, organisms, and birth effects into one canvas each frame.
- **Coordinate system unchanged in spirit**: same "1 unit = 1 CSS pixel" approach as the SVG version (§1) — `canvas.width`/`canvas.height` are set to the element's measured CSS size (`clientWidth`/`clientHeight`) instead of setting a `viewBox`, same underlying idea, different attribute.
- **Hit-testing**: `Soup.findEntityAt` (already coordinate-based, §7) needed no changes at all. Only the screen-to-local coordinate conversion changed — `attachCanvasClickHandler` uses `canvas.getBoundingClientRect()` plus the canvas's actual pixel dimensions instead of SVG's `createSVGPoint`/`getScreenCTM`, but produces the same kind of local `(x, y)` that `findEntityAt` already expected.
- **`renderSoup.js` trimmed**, not left with dead code: removed the now-unused SVG soup-rendering path (`organismElementCache`, `createCachedOrganism`, `updateCachedOrganism`, the old `renderSoup`/`renderNutrients`/`renderBirthEffects`/`attachSoupClickHandler`, `ANIM_UPDATE_RATE`) — kept only what the reference view still needs (`renderOrganism`, `renderOrganismReference`) and the shared animation math both the reference view and the new canvas renderer call (`getAppendagePose`, `getBodyThrobScale`, `APPENDAGE_ANIMATION_PROFILES`, the speed/scale constants).

## 26. Corpse-Scavenging (v1)

Closes §18's explicitly-flagged gap: corpses fade into a nutrient automatically, but weren't an active food source during the fade. Now `scavenger`/`detritivore` diets can feed directly on a nearby fading corpse.

- **`Soup.SCAVENGE_DIETS = new Set(['scavenger', 'detritivore'])`.** Every tick, each alive organism of one of these diets checks for a touching corpse (`deathTick !== null`, contact range = `displayRadius` sum — same two-tier sense/contact pattern as predation/mating) among `this.entities`; if found, it gains `Soup.SCAVENGE_ENERGY_RATE` (`0.01`, small — a repeatable per-tick trickle, not a one-time meal like predation's `0.4`) via the existing `feed()` method, and the corpse's `deathTick` is bumped by an extra `Soup.SCAVENGE_DECAY_BOOST` (`2`) on top of the normal `+1` aging the death-processing block already applies — so a corpse being actively scavenged decomposes roughly 3× faster than one left alone.
- **Not capped to one scavenger per corpse, unlike predation's `eatenIds`** — multiple scavengers can feed on the same corpse simultaneously (realistic; several organisms sharing a carcass isn't a bug the way two predators claiming the same one-time kill would be), so no tracking set is needed here.
- **Needed no changes to the existing death-processing code** — `Soup.tick()`'s death block already just does `entity.deathTick += 1` unconditionally each tick; scavenging bumping `deathTick` further beforehand composes correctly with that, the same way §11's crowding and §15's predation all layered onto existing mechanics without rewriting them.
- **Verified**: a corpse touched by a scavenger every tick decomposes measurably faster (fewer ticks to reach `FADE_TICKS`) than an identical corpse left alone; the scavenger's energy increases while in contact; nothing breaks when multiple scavengers touch the same corpse simultaneously.

## 27. Parasite Diet (v1)

The last diet type without a real mechanic (§15 explicitly deferred it, distinct from both foraging and predation: "feeding off a living host without necessarily killing it").

- **Implicit attachment, not a persistent state machine.** Every tick, each alive `parasite`-diet organism checks for a touching, eligible host (`host.traits.dietType !== 'parasite'` — no parasite-on-parasite hyperparasitism in v1, and `host.displayRadius >= parasite.displayRadius`, mirroring predation's size-based eligibility but requiring the host be at least as large rather than strictly smaller) among `this.entities`; if found, `Soup.PARASITE_DRAIN_RATE` (`0.01`) of energy is moved directly from the host to the parasite — `host.energy -= drained; parasite.feed(drained)` — rather than the parasite's energy appearing from nowhere. Deliberately not tracking "which host is this parasite attached to" across ticks — a parasite re-checks for *any* eligible touching host each tick, simpler than persistent attachment and close enough to the intended feel for v1 (real parasites do sometimes move between hosts too).
- **A prolonged drain can kill the host — reusing existing starvation death, not a new mechanic.** Draining `host.energy` low enough triggers the same starvation check (`isAlive` requires `energy > 0`, §14) every other energy-affecting system already goes through. This is the actual distinguishing behavior versus predation: a single parasite drains slowly enough that a host usually survives; enough parasites on one host, or a long enough infestation, still can kill it — without a dedicated "parasite kill" code path.
- **Verified**: a host loses energy and a parasite gains it while in contact (with the transferred amount matching exactly, not created or destroyed), a parasite doesn't attach to another parasite or to a smaller organism, and a sustained drain from multiple parasites can actually starve a host to death.

## 28. Diploid Genetics (v1)

The biggest of the three — flagged in §5 from the very start as "bigger scope, v2 idea," and treated with more care than the other two since it changes what every organism's genome *is*, not just adding a new interaction. Scoped to the smallest version that genuinely delivers the promised feature (recessive traits that can hide for a generation and reappear) rather than a full rewrite of genome/reproduction.

- **Every organism now carries two genomes, not one** — `LifeForm.genomeA`/`LifeForm.genomeB`, both regular `Genome` instances (the `Genome` class itself needed zero changes; diploid-ness is entirely a `LifeForm`-level concept, keeping the well-tested single-genome class untouched).
- **Expression rule: bitwise OR, "1 is dominant."** The organism's actual expressed traits are decoded from `genomeA.value | genomeB.value` (computed once at construction and cached, not on every trait access), not from either strand alone. A trait bit only expresses as `0` if *both* strands have `0` there — otherwise it expresses `1`. This is a deliberate simplification of real Mendelian dominance (which is per-gene, not "1 beats 0" as a blanket rule) chosen because it's the simplest rule that actually delivers "recessive traits hide and can reappear": a `0` can be silently carried in one strand while the other strand's `1` expresses, and if two carriers each happen to pass on their hidden `0` strand to an offspring, that offspring expresses the previously-hidden `0` — exactly the promised behavior.
- **Known, flagged consequence, not hidden**: because `1` always wins, a population's *expressed* traits will drift toward more bits reading as `1` over generations (it only takes one parent contributing a `1` at a position to express it, while a `0` needs both parents' contribution to show) — a real emergent property of this simplified rule, not present in true per-gene Mendelian dominance. Worth knowing about if trait distributions look like they're drifting in one direction over a long run.
- **Inheritance**:
  - **Asexual/budding** (`LifeForm.tryReproduce()`): both strands mutate independently — `child.genomeA = mutate(parent.genomeA)`, `child.genomeB = mutate(parent.genomeB)` — the same copy-and-mutate idea already used for the single-genome case, just applied to two strands instead of one.
  - **Sexual** (`Soup.matePairs()`): each parent contributes *one* of its own two strands, chosen at random, then mutated — `child.genomeA = mutate(randomPick(parentA.genomeA, parentA.genomeB))`, `child.genomeB = mutate(randomPick(parentB.genomeA, parentB.genomeB))`. This is a simplified stand-in for meiosis (real meiosis also recombines *within* a parent's two strands before passing one on) but captures the essential Mendelian behavior — each parent passes on one of its two copies at random — without needing to model within-parent recombination on top of everything else.
- **Compatibility and everything else uses the expressed genome, not either raw strand** — `Genome.areCompatible` (mate-finding, §11/§17/§19), the gene map diagram and genome table (Organism View, §12), and `calculateGeneticDiversity` (§20) all read from the same expressed-genome hex used for trait decoding, for one consistent notion of "this organism's genome" from the outside — the two-strand structure is an internal inheritance mechanism, not something every consumer needs to know about.
- **Every call site that constructed a `LifeForm` from one genome, or read `entity.genome`, needed updating** — found via a full-codebase search before starting, not discovered piecemeal: `Soup.spawnRandom` (now seeds two independent random genomes per organism), `Soup.tick()`'s asexual and sexual offspring construction, `LifeForm.tryReproduce()`/`Soup.matePairs()`'s inheritance logic, `Soup.calculateGeneticDiversity()`'s bit-reading, and Organism View's genome/gene-map display in `app.js`.
- **Verified**: an organism's expressed traits correctly equal the OR of its two strands for a range of genome pairs; asexual offspring's two strands are each independently mutated copies of the parent's corresponding strand; sexual offspring's strands are correctly drawn from a random one of each parent's two strands; a controlled scenario where both parents are heterozygous carriers of the same hidden recessive bit produces offspring that sometimes express it, demonstrating the "trait reappears" behavior directly rather than just trusting the rule on paper; and a full extended stress test confirms overall stability with diploid genetics active alongside every other system.

## 29. Spatial Indexing for Simulation Queries (v1)

A second, separate performance problem from §23–25's rendering work — that round fixed how fast the soup could be *drawn*; this one fixes how fast it can be *simulated*. Every tick, `predate()`, `scavenge()`, `parasitize()`, and `matePairs()` each do a full all-pairs scan (every organism against every other organism), and per-organism movement steering (`findNearestEntity`/`findEntitiesWithin`, §17's `seekMate`/`flee`/`schooling`/`ambush` patterns) does the same thing from the caller's side. That's several independent O(n²) passes per tick — fine at tens of organisms, but it's the next wall once population climbs toward `Soup.MAX_POPULATION` (600), independent of and in addition to the rendering cost §25 already addressed.

- **Chosen fix: a uniform spatial hash grid (`SpatialGrid`), not a quadtree.** Organism density in the soup is roughly uniform (no clustering mechanic pushes them into hot spots) and every query here is radius-bounded (a fixed distance around a point) rather than needing hierarchical subdivision — a fixed-cell grid is simpler to implement and reason about than a tree, and performs comparably for this access pattern.
- **`SpatialGrid.CELL_SIZE = 50`** — chosen against the range of query radii actually used: touch-distance checks (predation/scavenging/parasitism, `displayRadius` sums) top out around 20 (max `displayRadius` is `40 × 1.0 × VISUAL_SCALE(0.25) = 10`), while sensing-distance checks (mate-seeking, movement steering) range up to `senseRadius`'s max of 140. A single cell size can't be optimal for both ends of that range, but 50 keeps small queries within a handful of cells and large queries within a couple dozen — either way, a large improvement over scanning the entire population.
- **Rebuilt twice per tick, not per query — not once.** Movement steering (`seekMate`/`flee`/`schooling`/`ambush`, §17) queries the grid from inside `entity.update()` itself via `findNearestEntity()`/`findEntitiesWithin()`, so `Soup.rebuildEntityGrid()` first runs at the very start of `tick()`, before the movement loop, reflecting positions as of the previous tick's end. Once movement has actually happened, the grid is rebuilt a second time before `forage()`/`predate()`/`scavenge()`/`parasitize()`/`matePairs()` run, so those contact checks see current, not stale, positions. Both rebuilds are O(n), so doing it twice is still cheap relative to the O(n²) scans it replaces.
- **Indexes `this.entities` broadly — living organisms and fading corpses alike.** Predation/scavenging both need to find corpses/prey among "other entities," so filtering (`isAlive`, diet type, size comparison) still happens at each call site exactly as before; the grid only narrows which entities get checked at all, via `queryRadius(x, y, radius)` returning candidates from every cell overlapping that square bounding box. Exact circular distance is still computed and checked at the call site, unchanged — this makes the change purely about candidate-set size, not behavior.
- **Nutrients are deliberately NOT indexed.** `Soup.NUTRIENT_COUNT` (40) is a small, fixed constant that doesn't scale with population, so nutrient-related scans (`forage()`, `findNearestNutrient()`) are O(n × 40) — linear in population, not quadratic. They don't have the scaling problem this section exists to fix, and indexing them would be complexity without a corresponding win.
- **Every call site that did an unbounded `for (const other of this.entities)` proximity scan now queries the grid instead**: `predate()`, `scavenge()`, `parasitize()`, `matePairs()`, `findNearestEntity()`, `findEntitiesWithin()`. `findEntityAt()` (click-to-select) is left as a linear scan — it runs once per user click, not 600 times per tick, so the added complexity wouldn't pay for itself there.
- **Verified**: confirmed `queryRadius` returns exactly the same candidate organisms a manual "is this within the bounding box" check would (no cell-boundary off-by-one misses), confirmed predation/scavenging/parasitism/mate-pairing behavior is unchanged versus the old linear-scan implementation on identical fixed scenarios (same organisms eaten, same energy transferred, same pairs matched), and ran an extended stress test at a large population to confirm no crashes and a measurable reduction in per-tick work.

## 30. No Same-Species Predation (v1)

§15 originally allowed strict cannibalism — a predator could eat a smaller organism of its own kind, no exclusion at all. Revisited: predators shouldn't eat their own kind.

- **"Own kind" reuses the genome's existing species concept, not a new one.** §8's `compatibilityTag` (the genome's last 10 bits) is already described as an emergent species boundary — two organisms are the same "kind" if `Genome.areCompatible` says so, the identical test §11/§17/§19 already use to decide who can mate with whom. Rather than inventing a second, parallel notion of "same species" for predation (e.g. matching `dietType`, which is a behavioral category, not a lineage/relatedness one — two `herbivore`s could be totally unrelated species, while two organisms of different diets could still be close kin post-mutation), predation reuses the exact same compatibility check already wired up: **you can't eat something you could have mated with.**
- **`Soup.predate()`**: added one more skip condition alongside the existing size check — `if (Genome.areCompatible(predator.expressedGenome.hex, prey.expressedGenome.hex)) continue;`. Checked on expressed genomes (§28), consistent with every other compatibility check in the codebase. Everything else about predation (strictly-smaller-prey, contact-radius, one meal per predator per tick, `eatenIds`) is unchanged.
- **Not a hard species barrier — a drifting one, on purpose.** Because compatibility is itself an emergent, mutation-drifting property (§8), a population's cannibalism-immunity isn't a fixed rule per lineage; two individuals descended from the same recent ancestor stay "family" (protected from each other) only as long as their tags haven't drifted apart. This is consistent with the rest of the genome's "no hardcoded species logic" design rather than a special case bolted on for predation.
- **Verified**: a predator with a genome compatible with a smaller nearby organism does not eat it (energy/alive-state both unchanged); the same predator still eats an equally-reachable smaller organism whose genome is *not* compatible, confirming the new check is additive — narrows eligible prey, doesn't break existing predation — rather than accidentally suppressing it entirely.

## 31. New Soup & Reset (v1)

The first two working items from the Simulation menu (§2) — `Save State`/`Load State` stay disabled placeholders, out of scope here (real serialization is a bigger task on its own). `New Soup` and `Reset` needed a real distinction from each other, not just two buttons that both "start over" identically:

- **`New Soup`**: wipes the current population and spawns an entirely new random one — a fresh, unrelated random seed, same as what happens once at page load.
- **`Reset`**: rewinds back to *this soup's own starting population* — the exact genomes and starting positions it was last spawned with (whether that was page load or the last `New Soup` click) — undoing every tick of aging, mutation, death, and reproduction since, rather than generating a new random population.
- **Why keep them distinct rather than making `Reset` a synonym for `New Soup`**: `Reset` answers "let me watch this exact starting population play out again" (useful for comparing two runs of the same seed, or recovering from a run that went somewhere uninteresting); `New Soup` answers "I want a different population entirely." Collapsing them into one button would lose the first use case.
- **Mechanism — a captured seed snapshot, not full save-state**: `Soup.captureSeed()` returns `[{hexA, hexB, x, y}, ...]` for every currently-alive organism. This is taken once right after any (re)initialization — page load's initial `spawnRandom` and every future `New Soup` click — and held in `app.js`, not on `Soup` itself (it's about "what to rewind *to*," a concern of the app shell wiring buttons together, not the simulation model). `Reset` reconstructs the population from that stored snapshot; `New Soup` generates a fresh random population and then re-captures the snapshot to match, so a following `Reset` rewinds to the *new* starting point, not back to page load's original one.
- **`Soup.reinitialize(seed)`**: the shared wipe-and-respawn logic both buttons use — destroys every current entity properly (`entity.destroy()`, same as normal death-cleanup, §18), clears `nutrients`/`birthEffects`/`entityGrid`, resets `tickCount` to `0`, re-seeds `nutrients` fresh (§9's constructor logic, factored out so it isn't duplicated a third time), then either reconstructs `LifeForm`s from the given seed array (`Reset`) or spawns `count` brand-new random ones (`New Soup`, `seed` omitted) — one method, two calling conventions, rather than near-duplicate methods for each button.
- **App-shell side effects, not `Soup`'s concern**: both buttons close any open Organism View/Population View (the entity being inspected may no longer exist) and clear the side-panel Inspector's selection, then immediately refresh the status bar so the population/food/diversity numbers don't show stale pre-reset values for up to a second. Neither button changes Play/Pause state — if the sim was running, it keeps running on the new population; if paused, it stays paused.
- **Verified**: `Reset` reproduces the exact same genomes and starting positions as the original seed (byte-identical hex, not just "similar" organisms); `New Soup` produces a population of the requested size with fresh random genomes, and a `Reset` performed immediately afterward rewinds to *that* new population, not the original page-load one; tick count, nutrients, and birth effects are all back to their initial state after either action; an extended run afterward behaves normally (no leftover stale state from the previous soup causes issues).

## Open Questions

Resolved, per developer feedback:
- Predator/prey and sexual reproduction — deferred until a basic working system exists; not blocking v1 architecture decisions.
- Mutation — in scope; traits drift across generations.
- Cross-species breeding — in scope; offspring can blend traits from two different genomes/species.
- Visual style — SVG-based creatures (§7), not primitive shapes.
- Renderer strategy — SVG first, behind a swappable renderer interface with coordinate-based hit-testing, so canvas can replace it later without touching simulation/interaction code (§7).
- Target population — intentionally undecided; start small and scale up once the core system is proven, using the frame-cost thresholds in §7 as the signal to switch renderers.
- Single `LifeForm` class vs. per-species subclass — confirmed, going with one data-configured class (§5).
- Genome-blending rule for reproduction — resolved as bit-level crossover (single-point or uniform) plus bit-flip mutation, operating on a hex-string/`BigInt` genome decoded via a gene-map table; some trait bit ranges deliberately overlap for emergent correlation (§5, "Genome encoding").
- Haploid vs. diploid organisms — going haploid (one genome per organism) for v1; diploid dominance/recessive traits noted as a possible v2 extension (§5).
- Genome bit-length budget — 64 bits total for v1, per the trait-by-trait table in §5; not a hard ceiling, just a comfortable starting length.
- Curated overlap pairs and crossover style — 3–4 deliberate overlaps chosen for real trade-offs (`size`↔`speed`, `growthRate`↔`lifespan`, `size`↔`offspringCount`/`reproductionCost`, `appendageCount`↔`senseRadius`), combined via uniform (not single-point) crossover (§5).
- SVG asset approach — hybrid: small hand-built `<symbol>` library for categorical parts, continuous procedural transforms for everything else (§7).

No open items remain from the original list — next design pass can move toward defining the actual gene-map table and starting implementation.