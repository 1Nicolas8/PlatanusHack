/**
 * Corre SIM-10 + SIM-11 juntos: arquetipos reales del LLM alimentando el
 * generador de población. Verifica contra datos reales lo que los tests
 * verifican contra fixtures.
 *
 * Uso: ANTHROPIC_API_KEY=... node scripts/spike/population.js [--size 200] [--seed s1]
 */

const fs = require('node:fs');
const path = require('node:path');
const { generatePopulation } = require('../../src/features/audience/audience.population');
const { buildGraph } = require('../../src/features/audience/audience.graph');
const { simulatePropagation } = require('../../src/features/audience/audience.propagation');

const out = (line = '') => process.stdout.write(`${line}\n`);

async function main() {
  const argv = process.argv.slice(2);
  const arg = (name, fallback) => {
    const i = argv.indexOf(name);
    return i === -1 ? fallback : argv[i + 1];
  };
  const size = Number(arg('--size', 200));
  const seed = arg('--seed', 'demo-1');

  const fixture = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures', 'pair-01.json'), 'utf8'),
  );

  // Reusa el generador de arquetipos del otro spike sin duplicarlo.
  const { generateArchetypes } = require('./run');
  const { archetypes } = await generateArchetypes(fixture.context, 'claude-haiku-4-5');

  const population = generatePopulation({ archetypes, context: fixture.context, size, seed });

  out(`\nPoblación — semilla "${seed}", ${population.agents.length} agentes\n`);
  for (const d of population.distribution) {
    const bar = '█'.repeat(Math.round(d.share * 60));
    out(
      `  ${d.label.padEnd(28).slice(0, 28)} ${d.awareness.padEnd(15)} ` +
        `${String(d.count).padStart(3)}  ${(d.share * 100).toFixed(1).padStart(5)}%  ${bar}`,
    );
  }

  const total = population.distribution.reduce((s, d) => s + d.count, 0);
  const intents = population.agents.map((a) => a.purchaseIntent);
  const repeat = generatePopulation({ archetypes, context: fixture.context, size, seed });

  out('');
  out('--- verificación ---');
  out(`  total exacto:        ${total === size ? `SÍ (${total})` : `NO (${total} != ${size})`}`);
  out(`  determinista:        ${JSON.stringify(repeat.agents) === JSON.stringify(population.agents) ? 'SÍ' : 'NO'}`);
  out(`  rango de intent:     ${Math.min(...intents)} – ${Math.max(...intents)}`);
  out(`  grupos distintos:    ${population.distribution.length}`);
  const graph = buildGraph({ agents: population.agents, seed });
  const prop = simulatePropagation({ population, graph, seed });
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
  out(`  alcance total:        ${prop.totalReach} / ${size}`);
  out(`  alta intención:       ${prop.highIntentReach}`);
  out(`  profundidad:          ${prop.depthReached} rondas`);
  out(`  grupos SIN alcanzar:  ${prop.unreached.length ? prop.unreached.map((u) => u.label).join(', ') : 'ninguno'}`);
  out('');
}

main().catch((err) => {
  out(`\nFalló: ${err.message}\n`);
  process.exit(1);
});
