const { createRng } = require('../../shared/utils/rng');
const {
  PRICE_SENSITIVITY_SCORE,
  generatePopulationInputSchema,
} = require('./audience.schema');

const INTENT_SPREAD = 12;
const PRICE_SPREAD = 15;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Reparte `size` agentes entre los arquetipos según su share.
 *
 * Usa el método del resto mayor porque redondear cada share por separado no
 * suma `size`: con 8 arquetipos y 200 agentes se pierden o sobran unidades. Y
 * los shares del LLM tampoco suman 1 de forma confiable — se normalizan acá,
 * nunca se usan crudos.
 */
function allocateCounts(archetypes, size) {
  const total = archetypes.reduce((sum, a) => sum + a.sharePopulation, 0);
  // Si el modelo devolvió todo en cero, repartimos parejo en vez de romper.
  const shares = archetypes.map((a) => (total > 0 ? a.sharePopulation / total : 1 / archetypes.length));

  const exact = shares.map((s) => s * size);
  const counts = exact.map(Math.floor);
  let remaining = size - counts.reduce((sum, c) => sum + c, 0);

  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);

  for (let i = 0; remaining > 0; i = (i + 1) % byRemainder.length) {
    counts[byRemainder[i].index] += 1;
    remaining -= 1;
  }

  return counts;
}

/**
 * Crea un agente a partir de su arquetipo.
 *
 * Los atributos ESTRUCTURALES (awareness, objeciones, dolores) no varían: son
 * lo que define al grupo, y si variaran los grupos dejarían de ser grupos y no
 * se podría medir propagación entre ellos. Lo que varía son los atributos
 * CONTINUOS — intención de compra y sensibilidad al precio — porque dentro de
 * un mismo perfil de comprador esos valores sí se distribuyen.
 *
 * La geografía viaja como contexto en cada agente, sin modificador numérico.
 * Aplicar uno sería asumir que todos en una ciudad reaccionan igual, que es
 * justamente lo que el modelo de mercado NO debe hacer: la geografía influye a
 * través del lenguaje y las prioridades que evalúa el LLM, no de un multiplicador.
 */
function createAgent({ archetype, context, rng, index }) {
  const basePrice = PRICE_SENSITIVITY_SCORE[archetype.priceSensitivity];

  return {
    id: `${archetype.id}-${index}`,
    archetypeId: archetype.id,
    archetypeLabel: archetype.label,

    awareness: archetype.awareness,
    painPoints: archetype.painPoints,
    objections: archetype.objections,

    purchaseIntent: Math.round(clamp(archetype.purchaseIntent + rng.jitter(INTENT_SPREAD), 0, 100)),
    priceSensitivityScore: Math.round(clamp(basePrice + rng.jitter(PRICE_SPREAD), 0, 100)),

    market: {
      location: context.location,
      industry: context.industry,
      buyer: context.buyer,
    },
  };
}

/**
 * SIM-11 — expande los arquetipos a una población de agentes.
 *
 * Determinista: la misma semilla produce exactamente la misma población.
 * No hace llamadas al LLM.
 *
 * @returns {{ seed: string, size: number, agents: object[], distribution: object[] }}
 */
function generatePopulation(input) {
  const { archetypes, context, size, seed } = generatePopulationInputSchema.parse(input);

  const rng = createRng(seed);
  const counts = allocateCounts(archetypes, size);

  const agents = [];
  archetypes.forEach((archetype, i) => {
    for (let n = 0; n < counts[i]; n += 1) {
      agents.push(createAgent({ archetype, context, rng, index: agents.length }));
    }
  });

  const distribution = archetypes.map((archetype, i) => ({
    archetypeId: archetype.id,
    label: archetype.label,
    awareness: archetype.awareness,
    count: counts[i],
    share: counts[i] / size,
  }));

  return { seed, size, agents, distribution };
}

module.exports = { generatePopulation, allocateCounts };
