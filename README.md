# BLife

A web-based life simulation — microscopic organisms living, moving, feeding, reproducing, and dying in a primordial soup, driven entirely by a genetic bit-string encoded in each organism.

Built with plain HTML, CSS, and JavaScript. No frameworks, no build step, no dependencies — open `index.html` in a browser and it runs.

## What's here

- **Genome system** — each organism carries an 80-bit genome (hex-encoded), decoded into traits (movement, diet, size, speed, lifespan, reproduction, appearance, and more) via a documented gene map, with some traits deliberately overlapping bit ranges for emergent trait correlation.
- **A living soup** — organisms drift, seek food, flee predators, school, or sit in ambush depending on their genome; they photosynthesize, forage nutrient particles, or hunt smaller organisms depending on diet; they age, starve, get eaten, or die of old age (fading out and returning to the soup as a nutrient); they reproduce asexually or by finding a genetically compatible mate.
- **Population dynamics** — a soft carrying-capacity model throttles reproduction and raises death pressure as the soup fills up, so population self-stabilizes rather than exploding or crashing.
- **Organism View** — click any organism to see a full detail screen: an enlarged animated rendering of its actual shape, a genome-browser-style visual gene map (colored by trait, packed into lanes so overlapping genes are visible), and its full decoded trait list.
- **Population View** — every living organism, browsable grouped by diet type or sorted by age/size.
- **Hand-built procedural creature art** — 8 distinct body silhouettes and 8 appendage shapes (each with its own animation behavior — swaying, orbiting, flicking, stretching), generated from genome traits rather than hand-drawn per organism.

## Running it

Open `index.html` directly in a browser — no server or build step required.

`genome-test.html` is a standalone debug page (reachable from the app's Debug menu) that exercises the genome system in isolation: random genome generation, decoding, mate-compatibility checking, crossover, and mutation.

## Documentation

`docs/Game-Plan.md` is the living design document — every feature, design decision, and the reasoning behind it, in the order it was built. `docs/Initial-requirements.txt` is the original project brief.
