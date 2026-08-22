const { createRng } = require('../../shared/utils/rng');

const DEFAULT_MAX_DEPTH = 4;
const DEFAULT_INITIAL_EXPOSURE = 0.15;
const HIGH_INTENT_THRESHOLD = 70;

/**
 * Probabilidad de que un agente comparta, por defecto.
 *
 * PLACEHOLDER deliberado: la probabilidad real sale del scoring del post
 * (SIM-12), que todavía no existe. Se deriva de la intención de compra solo
 * para que la propagación sea ejecutable y testeable sin depender del LLM.
 * Cuando SIM-12 esté, se inyecta la real por parámetro y esto no se usa más.
 */
const defaultShareProbability = (agent) => (agent.purchaseIntent / 100) * 0.25;

/**
 * SIM-27 — propaga el post por el grafo y registra por qué grupos viaja.
 *
 * Lo que importa no es el alcance total sino el recorrido: qué arquetipo expone
 * a qué arquetipo, y sobre todo cuáles NO se alcanzan nunca. Un mensaje que
 * circula entre early adopters y jamás toca a los compradores de alta intención
 * es exactamente el fracaso que un founder no ve en LinkedIn.
 *
 * @returns {{ matrix: object, reachedByArchetype: object, unreached: object[],
 *             depthReached: number, totalReach: number, highIntentReach: number,
 *             rounds: object[] }}
 */
function simulatePropagation({
  population,
  graph,
  seed,
  shareProbability = defaultShareProbability,
  maxDepth = DEFAULT_MAX_DEPTH,
  initialExposureRate = DEFAULT_INITIAL_EXPOSURE,
}) {
  const rng = createRng(`${seed}:propagation`);
  const agentById = new Map(population.agents.map((a) => [a.id, a]));

  const archetypeIds = population.distribution.map((d) => d.archetypeId);
  const matrix = {};
  for (const from of ['seed', ...archetypeIds]) {
    matrix[from] = Object.fromEntries(archetypeIds.map((to) => [to, 0]));
  }

  const exposed = new Set();
  const reachedByArchetype = Object.fromEntries(archetypeIds.map((id) => [id, 0]));
  const rounds = [];

  const expose = (agent, fromArchetype) => {
    if (exposed.has(agent.id)) return false;
    exposed.add(agent.id);
    reachedByArchetype[agent.archetypeId] += 1;
    matrix[fromArchetype][agent.archetypeId] += 1;
    return true;
  };

  // Ronda 0: el alcance propio del founder. No pasa por el grafo.
  let frontier = [];
  for (const agent of population.agents) {
    if (rng.next() < initialExposureRate && expose(agent, 'seed')) frontier.push(agent);
  }
  rounds.push({ depth: 0, newlyExposed: frontier.length, sharers: 0 });

  let depthReached = 0;

  for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth += 1) {
    const sharers = frontier.filter((agent) => rng.next() < shareProbability(agent));
    const next = [];

    for (const sharer of sharers) {
      const neighbours = graph.adjacency.get(sharer.id) ?? new Set();
      for (const neighbourId of neighbours) {
        const neighbour = agentById.get(neighbourId);
        if (neighbour && expose(neighbour, sharer.archetypeId)) next.push(neighbour);
      }
    }

    rounds.push({ depth, newlyExposed: next.length, sharers: sharers.length });
    if (next.length > 0) depthReached = depth;
    frontier = next;
  }

  const unreached = population.distribution
    .filter((d) => reachedByArchetype[d.archetypeId] === 0)
    .map((d) => ({ archetypeId: d.archetypeId, label: d.label, size: d.count }));

  const highIntentReach = [...exposed]
    .map((id) => agentById.get(id))
    .filter((a) => a.purchaseIntent >= HIGH_INTENT_THRESHOLD).length;

  return {
    matrix,
    reachedByArchetype,
    unreached,
    depthReached,
    totalReach: exposed.size,
    highIntentReach,
    rounds,
  };
}

module.exports = {
  simulatePropagation,
  defaultShareProbability,
  HIGH_INTENT_THRESHOLD,
  DEFAULT_MAX_DEPTH,
};
