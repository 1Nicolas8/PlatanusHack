jest.mock('../alcance.repository');
jest.mock('../../audience/audience.real-population');
jest.mock('../../audience/audience.graph');
jest.mock('../../audience/audience.propagation');

const AppError = require('../../../shared/errors/AppError');
const { findLatestCalibrationRun } = require('../alcance.repository');
const {
  loadRealPopulation,
  createCalibratedShareProbability,
} = require('../../audience/audience.real-population');
const { buildGraph } = require('../../audience/audience.graph');
const { simulatePropagation } = require('../../audience/audience.propagation');
const { estimateReach } = require('../alcance.service');

const population = {
  seed: 'poblacion-real',
  size: 10,
  agents: [{ id: 'a1' }],
  distribution: [
    { archetypeId: 'a1', archetypeLabel: 'Founder', count: 6 },
    { archetypeId: 'a2', archetypeLabel: 'Decisor', count: 4 },
  ],
};

describe('alcance.service estimateReach', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    findLatestCalibrationRun.mockResolvedValue({ id: 'corrida-actual' });
    loadRealPopulation.mockResolvedValue(population);
    createCalibratedShareProbability.mockReturnValue('calibrated-share-probability');
    buildGraph.mockReturnValue({ adjacency: new Map() });
    simulatePropagation.mockReturnValue({
      rounds: [{ depth: 0, newlyExposed: 2, sharers: 0 }],
      totalReach: 7,
      reachedByArchetype: { a1: 5, a2: 2 },
    });
  });

  it('orquesta la población calibrada y devuelve alcance directo, propagado y por arquetipo', async () => {
    const result = await estimateReach({ copy: 'Un copy para estimar' });

    expect(loadRealPopulation).toHaveBeenCalledWith({ corridaId: 'corrida-actual', supabase: undefined });
    expect(buildGraph).toHaveBeenCalledWith({ agents: population.agents, seed: population.seed });
    expect(simulatePropagation).toHaveBeenCalledWith({
      population,
      graph: { adjacency: expect.any(Map) },
      seed: population.seed,
      shareProbability: 'calibrated-share-probability',
    });
    expect(result).toEqual({
      alcanceDirecto: 2,
      alcancePropagado: 5,
      poblacionTotal: 10,
      distribucionPorArquetipo: [
        { arquetipo: 'Founder', alcance: 5, poblacion: 6 },
        { arquetipo: 'Decisor', alcance: 2, poblacion: 4 },
      ],
    });
  });

  it('rechaza con un error de negocio cuando todavía no existe una corrida calibrada', async () => {
    findLatestCalibrationRun.mockResolvedValue(null);

    await expect(estimateReach({ copy: 'Un copy para estimar' }))
      .rejects
      .toEqual(expect.objectContaining({
        name: AppError.name,
        statusCode: 409,
        message: 'No hay una corrida de calibración disponible para estimar el alcance.',
      }));
    expect(loadRealPopulation).not.toHaveBeenCalled();
  });
});
