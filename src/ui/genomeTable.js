/**
 * renderGenomeTable — builds a labeled <section> with every decoded trait from a genome
 * hex string, value stacked below its label. Shared by genome-test.html (the debug page)
 * and the game's Inspector panel so both display genomes identically.
 */
function renderGenomeTable(label, hex) {
  const genome = new Genome(hex);
  const traits = genome.decodeAll();

  const section = document.createElement('section');
  section.className = 'genome-table';

  const heading = document.createElement('h2');
  heading.textContent = `${label} — ${hex}`;
  section.appendChild(heading);

  const list = document.createElement('dl');
  for (const [trait, value] of Object.entries(traits)) {
    const dt = document.createElement('dt');
    dt.textContent = trait;
    const dd = document.createElement('dd');
    dd.textContent = typeof value === 'number' ? value.toFixed(3) : value;
    list.appendChild(dt);
    list.appendChild(dd);
  }
  section.appendChild(list);

  genome.destroy();
  return section;
}
