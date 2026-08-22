/**
 * Carga la población real de LinkedIn y ejecuta el grafo y la propagación.
 *
 * Uso: node scripts/spike/population.js --corrida-id <id> [--seed s1] [--share-factor 0.25]
 */

const {
  loadRealPopulation,
  createCalibratedShareProbability,
} = require('../../src/features/audience/audience.real-population');
const { buildGraph } = require('../../src/features/audience/audience.graph');
const { simulatePropagation } = require('../../src/features/audience/audience.propagation');

const out = (line = '') => process.stdout.write(`${line}\n`);

async function main() {
  const argv = process.argv.slice(2);
  const arg = (name, fallback) => {
    const i = argv.indexOf(name);
    return i === -1 ? fallback : argv[i + 1];
  };
  const corridaId = arg('--corrida-id', process.env.CORRIDA_CALIBRACION_ID);
  const seed = arg('--seed', 'demo-1');
  const shareFactor = Number(arg('--share-factor', 0.25));
  if (!corridaId) throw new Error('--corrida-id es obligatorio.');

  const population = await loadRealPopulation({ corridaId, seed });

  out(`\nPoblación — semilla "${seed}", ${population.agents.length} agentes\n`);
  for (const d of population.distribution) {
    const share = d.count / population.size;
    const bar = '█'.repeat(Math.round(share * 60));
    out(
      `  ${d.archetypeLabel.padEnd(28).slice(0, 28)} ` +
        `${String(d.count).padStart(3)}  ${(share * 100).toFixed(1).padStart(5)}%  ${bar}`,
    );
  }

  const total = population.distribution.reduce((s, d) => s + d.count, 0);
  const rates = population.agents.map((a) => a.tasaCalibrada);

  out('');
  out('--- verificación ---');
  out(`  total exacto:        ${total === population.size ? `SÍ (${total})` : `NO (${total} != ${population.size})`}`);
  out(`  sin arquetipo:       ${population.agents.filter((agent) => !agent.archetypeId).length}`);
  out(`  rango de tasas:      ${Math.min(...rates).toFixed(6)} – ${Math.max(...rates).toFixed(6)}`);
  out(`  grupos distintos:    ${population.distribution.length}`);
  const graph = buildGraph({ agents: population.agents, seed });
  const prop = simulatePropagation({
    population,
    graph,
    seed,
    shareProbability: createCalibratedShareProbability(shareFactor),
  });
  const ids = population.distribution.map((d) => d.archetypeId);
  const short = (id) => id.slice(0, 9).padEnd(9);

  out('--- grafo ---');
  out(`  aristas: ${graph.edges}  ·  dentro del mismo grupo: ${(graph.homophilyRatio * 100).toFixed(0)}%`);
  out('');
  out('--- propagación entre grupos (filas = origen, columnas = destino) ---');
  out(`  ${''.padEnd(11)}${ids.map(short).join('')}`);
  for (const from of ['seed', ...ids]) {
    const row = ids.map((to) => String(prop.matrix[from][to]).padStart(4).padEnd(9)).join('');
    out(`  ${short(from).padEnd(11)}${row}`);
  }
  out('');
  out(`  alcance total:        ${prop.totalReach} / ${population.size}`);
  out(`  profundidad:          ${prop.depthReached} rondas`);
  out(`  grupos SIN alcanzar:  ${prop.unreached.length ? prop.unreached.map((u) => u.label).join(', ') : 'ninguno'}`);
  out('');
}

main().catch((err) => {
  out(`\nFalló: ${err.message}\n`);
  process.exit(1);
});
