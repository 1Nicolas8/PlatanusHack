/**
 * SPIKE DESCARTABLE — SIM-10 (arquetipos) con medición de distinguibilidad.
 *
 * El gate antes de construir la población NO es el A/B. Es más temprano y más
 * barato: ¿los arquetipos son realmente distintos entre sí? Si el modelo
 * devuelve N compradores que son el mismo con distinto nombre, la población
 * hereda esa chatura y todo lo que se construya encima está sobre arena.
 *
 * Nota sobre reproducibilidad: en la familia 5 el parámetro `temperature` fue
 * removido de la API (devuelve 400). El paso LLM no se puede volver
 * determinista bajando temperatura — la reproducibilidad del sistema tiene que
 * venir de persistir estos arquetipos y reusarlos, nunca de re-preguntar.
 *
 * Uso:
 *   ANTHROPIC_API_KEY=... node scripts/spike/run.js
 *   ANTHROPIC_API_KEY=... node scripts/spike/run.js --model claude-opus-5 --runs 3
 */

const fs = require('node:fs');
const path = require('node:path');
const Anthropic = require('@anthropic-ai/sdk');
// zod/v4: el helper del SDK trabaja sobre la API v4, que en zod 3.25 vive en
// este subpath. El resto del repo sigue usando la API clásica de `zod`.
const z = require('zod/v4');
const { zodOutputFormat } = require('@anthropic-ai/sdk/helpers/zod');

const DEFAULT_MODEL = 'claude-haiku-4-5';
const ARCHETYPE_COUNT = 8;

// `output_config.effort` existe en la familia 5 y devuelve 400 en Haiku 4.5.
const supportsEffort = (model) => !model.includes('haiku-4-5') && !model.includes('sonnet-4-5');

const out = (line = '') => process.stdout.write(`${line}\n`);

const AWARENESS = ['unaware', 'problem-aware', 'solution-aware', 'product-aware'];
const SENSITIVITY = ['low', 'medium', 'high'];

const ArchetypesSchema = z.object({
  archetypes: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        role: z.string(),
        companySize: z.string(),
        awareness: z.enum(AWARENESS),
        painPoints: z.array(z.string()),
        objections: z.array(z.string()),
        priceSensitivity: z.enum(SENSITIVITY),
        contentBehavior: z.string(),
        purchaseIntent: z.number(),
        sharePopulation: z.number(),
      }),
    )
    .length(ARCHETYPE_COUNT),
});

function parseArgs(argv) {
  const args = {
    runs: 1,
    model: DEFAULT_MODEL,
    fixture: path.join(__dirname, 'fixtures', 'pair-01.json'),
  };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--runs') args.runs = Number(argv[i + 1]);
    if (argv[i] === '--model') args.model = argv[i + 1];
    if (argv[i] === '--fixture') args.fixture = argv[i + 1];
  }
  return args;
}

async function generateArchetypes(context, model = DEFAULT_MODEL, client = new Anthropic()) {
  const request = {
    model,
    max_tokens: 8000,
    system:
      'Sos un analista de go-to-market B2B. Derivás arquetipos de comprador a partir de un ICP.\n' +
      'Regla dura: los arquetipos tienen que ser DISTINGUIBLES. Si dos reaccionarían igual al mismo ' +
      'mensaje, sobra uno. Variá el awareness, las objeciones y la sensibilidad al precio — no ' +
      'produzcas ocho versiones del mismo comprador con distinto nombre.\n' +
      'La geografía es contexto, no destino: modifica lenguaje, prioridades y sensibilidad al precio, ' +
      'pero no asumas que todos en una ciudad reaccionan igual.\n' +
      'purchaseIntent va de 0 a 100. sharePopulation es la fracción de la audiencia y el total suma 1.',
    messages: [
      {
        role: 'user',
        content:
          `Producto: ${context.product}\n` +
          `ICP: ${context.icp}\n` +
          `Industria: ${context.industry}\n` +
          `Mercado: ${context.location}\n` +
          `Buyer: ${context.buyer}\n` +
          `Objetivo comercial: ${context.goal}\n\n` +
          `Generá exactamente ${ARCHETYPE_COUNT} arquetipos de comprador dentro de este ICP.`,
      },
    ],
    output_config: { format: zodOutputFormat(ArchetypesSchema) },
  };
  if (supportsEffort(model)) request.output_config.effort = 'high';

  const response = await client.messages.parse(request);
  if (!response.parsed_output) throw new Error('El modelo no devolvió arquetipos válidos');
  return { archetypes: response.parsed_output.archetypes, usage: response.usage };
}

/**
 * Distinguibilidad: qué fracción de los pares de arquetipos difiere en al menos
 * una dimensión estructural. Si da bajo, el modelo está devolviendo el mismo
 * comprador repetido y la población que salga de ací no va a variar.
 */
function distinctiveness(archetypes) {
  const key = (a) => `${a.awareness}|${a.priceSensitivity}|${Math.round(a.purchaseIntent / 20)}`;
  let distinct = 0;
  let pairs = 0;
  for (let i = 0; i < archetypes.length; i += 1) {
    for (let j = i + 1; j < archetypes.length; j += 1) {
      pairs += 1;
      if (key(archetypes[i]) !== key(archetypes[j])) distinct += 1;
    }
  }
  const uniqueAwareness = new Set(archetypes.map((a) => a.awareness)).size;
  const objections = archetypes.flatMap((a) => a.objections.map((o) => o.toLowerCase().trim()));
  const objectionOverlap = 1 - new Set(objections).size / (objections.length || 1);
  const intents = archetypes.map((a) => a.purchaseIntent);

  return {
    pairRatio: pairs ? distinct / pairs : 0,
    uniqueAwareness,
    objectionOverlap,
    intentSpread: Math.max(...intents) - Math.min(...intents),
    shareSum: archetypes.reduce((s, a) => s + a.sharePopulation, 0),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!process.env.ANTHROPIC_API_KEY) {
    out('\nFalta ANTHROPIC_API_KEY. El spike no puede correr sin ella.\n');
    process.exit(1);
  }

  const fixture = JSON.parse(fs.readFileSync(args.fixture, 'utf8'));
  const client = new Anthropic();

  out(`\nSpike arquetipos — ${fixture.id}`);
  out(`modelo: ${args.model}${supportsEffort(args.model) ? " (effort: high)" : ' (sin effort: no soportado)'}`);
  out(`corridas: ${args.runs}\n`);

  const runs = [];
  for (let i = 0; i < args.runs; i += 1) {
    // Secuencial a propósito: buscamos ver variación entre corridas.
     
    const { archetypes, usage } = await generateArchetypes(fixture.context, args.model, client);
    const d = distinctiveness(archetypes);
    runs.push({ archetypes, d, usage });

    out(`  corrida ${i + 1}:`);
    for (const a of archetypes) {
      out(
        `    ${a.label.padEnd(26).slice(0, 26)} ${a.awareness.padEnd(15)} ` +
          `precio=${a.priceSensitivity.padEnd(6)} intent=${String(a.purchaseIntent).padStart(3)} ` +
          `share=${a.sharePopulation.toFixed(2)}`,
      );
    }
    out(
      `    → pares distintos ${(d.pairRatio * 100).toFixed(0)}%  ·  awareness únicos ${d.uniqueAwareness}/4  ` +
        `·  objeciones repetidas ${(d.objectionOverlap * 100).toFixed(0)}%  ·  spread intent ${d.intentSpread}  ` +
        `·  shares suman ${d.shareSum.toFixed(2)}`,
    );
    out('');
  }

  const avg = (fn) => runs.reduce((s, r) => s + fn(r.d), 0) / runs.length;
  const pairRatio = avg((d) => d.pairRatio);
  const overlap = avg((d) => d.objectionOverlap);
  const spread = avg((d) => d.intentSpread);

  out('--- veredicto ---');
  out(`  pares distintos:      ${(pairRatio * 100).toFixed(0)}%   (queremos > 70%)`);
  out(`  objeciones repetidas: ${(overlap * 100).toFixed(0)}%   (queremos < 30%)`);
  out(`  spread de intent:     ${spread.toFixed(0)}    (queremos > 40)`);
  const ok = pairRatio > 0.7 && overlap < 0.3 && spread > 40;
  out(`  ${ok ? 'PASA — los arquetipos son distinguibles, se puede construir la población encima.' : 'NO PASA — el modelo está devolviendo el mismo comprador repetido.'}`);
  if (!ok) {
    out('');
    out('  Antes de cambiar de modelo: subí ARCHETYPE_COUNT a 10, endurecé el system prompt,');
    out(`  o probá ${args.model.includes('haiku') ? 'claude-opus-5' : 'otro modelo'} con --model para ver si es el modelo o el prompt.`);
  }
  out('');
}

if (require.main === module) {
  main().catch((err) => {
    out(`\nFalló el spike: ${err.message}\n`);
    process.exit(1);
  });
}

module.exports = { generateArchetypes, distinctiveness };
