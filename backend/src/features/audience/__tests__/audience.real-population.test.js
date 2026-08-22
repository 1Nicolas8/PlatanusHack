const {
  loadRealPopulation,
  createCalibratedShareProbability,
} = require('../audience.real-population');
const { buildGraph } = require('../audience.graph');
const { simulatePropagation } = require('../audience.propagation');

function createSupabaseFixture() {
  const archetypes = Array.from({ length: 12 }, (_, index) => ({
    id: index + 1,
    nombre: `Arquetipo ${index + 1}`,
  }));
  const agents = Array.from({ length: 406 }, (_, index) => ({
    id: index + 1,
    conexion_id: 1000 + index,
    arquetipo_id: (index % 12) + 1,
    nivel: index % 3 === 0 ? 'calibrado' : 'prior',
    reacciones_observadas: index % 5,
  }));
  const calibrations = agents.map((agent) => ({
    agente_id: agent.id,
    corrida_id: 'corrida-real',
    tasa_calibrada: ((agent.id % 10) + 1) / 100,
  }));
  const rowsByTable = {
    agentes_simulacion: agents,
    arquetipos: archetypes,
    calibraciones_agentes: calibrations,
  };

  return {
    from(table) {
      let rows = rowsByTable[table];
      const query = {
        select() { return query; },
        eq(column, value) {
          rows = rows.filter((row) => row[column] === value);
          return query;
        },
        order(column) {
          return Promise.resolve({
            data: [...rows].sort((left, right) => Number(left[column]) - Number(right[column])),
            error: null,
          });
        },
      };
      return query;
    },
  };
}

describe('loadRealPopulation', () => {
  it('adapta los 406 agentes reales y ejecuta grafo y propagación de forma determinista', async () => {
    const population = await loadRealPopulation({
      corridaId: 'corrida-real',
      seed: 'misma-semilla',
      supabase: createSupabaseFixture(),
    });

    expect(population).toMatchObject({ seed: 'misma-semilla', size: 406 });
    expect(population.agents).toHaveLength(406);
    expect(population.distribution).toHaveLength(12);
    expect(population.agents.every((agent) => agent.archetypeId)).toBe(true);
    expect(population.agents[0]).toEqual({
      id: '1',
      archetypeId: '1',
      archetypeLabel: 'Arquetipo 1',
      nivel: 'calibrado',
      tasaCalibrada: 0.02,
      reaccionesObservadas: 0,
      conexionId: '1000',
    });

    const graphA = buildGraph({ agents: population.agents, seed: population.seed });
    const graphB = buildGraph({ agents: population.agents, seed: population.seed });
    expect(graphA).toEqual(graphB);

    const options = {
      population,
      seed: population.seed,
      shareProbability: createCalibratedShareProbability(),
    };
    expect(simulatePropagation({ ...options, graph: graphA }))
      .toEqual(simulatePropagation({ ...options, graph: graphB }));
  });
});
