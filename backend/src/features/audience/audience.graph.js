const { createRng } = require('../../shared/utils/rng');

const DEFAULT_AVG_DEGREE = 8;
/**
 * Fracción de conexiones que caen dentro del propio arquetipo.
 *
 * El valor importa más de lo que parece. En 1.0 el grafo queda segregado en
 * islas y el mensaje nunca sale de su grupo: la propagación entre grupos daría
 * cero siempre. En 0 no hay estructura y todo se mezcla parejo, con lo que
 * medir "propagación entre grupos" pierde sentido. 0.7 deja clusters
 * reconocibles con puentes reales entre ellos.
 */
const DEFAULT_HOMOPHILY = 0.7;

/**
 * SIM-15 — construye el grafo sintético de la audiencia.
 *
 * No reproduce el grafo social de LinkedIn: es un modelo experimental de
 * cercanía. Lo único que tiene que sostener es que dos agentes del mismo
 * arquetipo tengan más chance de estar conectados que dos al azar, y que igual
 * existan puentes entre grupos.
 *
 * @returns {{ adjacency: Map<string, Set<string>>, edges: number, degrees: object,
 *             homophilyRatio: number }}
 */
function buildGraph({ agents, seed, avgDegree = DEFAULT_AVG_DEGREE, homophily = DEFAULT_HOMOPHILY }) {
  if (!Array.isArray(agents) || agents.length < 2) {
    throw new Error('Se necesitan al menos 2 agentes para construir un grafo');
  }

  const rng = createRng(`${seed}:graph`);
  const adjacency = new Map(agents.map((a) => [a.id, new Set()]));

  const byArchetype = new Map();
  for (const agent of agents) {
    if (!byArchetype.has(agent.archetypeId)) byArchetype.set(agent.archetypeId, []);
    byArchetype.get(agent.archetypeId).push(agent);
  }

  const connect = (a, b) => {
    if (a.id === b.id) return;
    adjacency.get(a.id).add(b.id);
    adjacency.get(b.id).add(a.id);
  };

  // avgDegree/2 intentos por agente: cada arista suma grado a los dos extremos.
  const attemptsPerAgent = Math.max(1, Math.round(avgDegree / 2));

  for (const agent of agents) {
    const sameGroup = byArchetype.get(agent.archetypeId);

    for (let i = 0; i < attemptsPerAgent; i += 1) {
      const goesInside = rng.next() < homophily && sameGroup.length > 1;
      const pool = goesInside
        ? sameGroup
        : agents.filter((other) => other.archetypeId !== agent.archetypeId);

      // Un arquetipo puede ser el único del grafo: no hay puente posible.
      if (pool.length === 0) continue;
      connect(agent, rng.pick(pool));
    }
  }

  const degrees = {};
  let sameArchetypeEdges = 0;
  let totalEdges = 0;
  const agentById = new Map(agents.map((a) => [a.id, a]));

  for (const [id, neighbours] of adjacency) {
    degrees[id] = neighbours.size;
    for (const other of neighbours) {
      // Cada arista se ve dos veces; la contamos una sola.
      if (id < other) {
        totalEdges += 1;
        if (agentById.get(id).archetypeId === agentById.get(other).archetypeId) {
          sameArchetypeEdges += 1;
        }
      }
    }
  }

  return {
    adjacency,
    edges: totalEdges,
    degrees,
    /** Qué fracción de las aristas quedó dentro del mismo arquetipo. */
    homophilyRatio: totalEdges > 0 ? sameArchetypeEdges / totalEdges : 0,
  };
}

module.exports = { buildGraph, DEFAULT_AVG_DEGREE, DEFAULT_HOMOPHILY };
