const AppError = require('../../shared/errors/AppError');
const {
  loadRealPopulation,
  createCalibratedShareProbability,
} = require('../audience/audience.real-population');
const { buildGraph } = require('../audience/audience.graph');
const { simulatePropagation } = require('../audience/audience.propagation');
const { findLatestCalibrationRun } = require('./alcance.repository');

async function estimateReach({ copy, supabase } = {}) {
  const calibrationRun = await findLatestCalibrationRun({ supabase });
  if (!calibrationRun) {
    throw AppError.conflict('No hay una corrida de calibración disponible para estimar el alcance.');
  }

  // El scoring por arquetipo aún no existe, por eso el copy no altera la simulación.
  void copy;

  const population = await loadRealPopulation({
    corridaId: calibrationRun.id,
    supabase,
  });
  const graph = buildGraph({ agents: population.agents, seed: population.seed });
  const propagation = simulatePropagation({
    population,
    graph,
    seed: population.seed,
    shareProbability: createCalibratedShareProbability(),
  });
  const alcanceDirecto = propagation.rounds[0].newlyExposed;

  return {
    alcanceDirecto,
    alcancePropagado: propagation.totalReach - alcanceDirecto,
    poblacionTotal: population.size,
    distribucionPorArquetipo: population.distribution.map((archetype) => ({
      arquetipo: archetype.archetypeLabel,
      alcance: propagation.reachedByArchetype[archetype.archetypeId],
      poblacion: archetype.count,
    })),
  };
}

module.exports = { estimateReach };
