const output = document.getElementById('output');

const genomeA = Genome.random();
const genomeB = Genome.random();
output.appendChild(renderGenomeTable('Parent A', genomeA));
output.appendChild(renderGenomeTable('Parent B', genomeB));

const compatNote = document.createElement('p');
const distance = Genome.tagDistance(genomeA, genomeB);
compatNote.textContent = `Parent A/B compatibility tag distance: ${distance} `
  + `(${Genome.areCompatible(genomeA, genomeB) ? 'compatible' : 'not compatible'}, `
  + `threshold <= ${Genome.COMPATIBILITY_THRESHOLD})`;
output.appendChild(compatNote);

const childHex = Genome.crossover(genomeA, genomeB);
output.appendChild(renderGenomeTable('Child (crossover only)', childHex));

const mutatedChildHex = Genome.mutate(childHex, 0.03);
output.appendChild(renderGenomeTable('Child (crossover + mutation)', mutatedChildHex));
