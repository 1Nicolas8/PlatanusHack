const service = require('./scoring.service');
const { explainComparison } = require('./scoring.explain');
const { buildRecommendation } = require('./scoring.recommend');
const repository = require('./scoring.repository');
const AppError = require('../../shared/errors/AppError');

/**
 * Devuelve todo lo que la pantalla de resultados necesita en una sola llamada:
 * comparación, explicación con evidencia y la versión sugerida.
 */
async function compare(req, res) {
  const { postA, postB, icp, withRecommendation = true } = req.body;

  const [archetypes, agents] = await Promise.all([
    repository.loadArchetypes(),
    repository.loadAgents(),
  ]);

  if (archetypes.length === 0 || agents.length === 0) {
    throw AppError.badRequest(
      'No hay audiencia calibrada cargada. Corré primero la generación de arquetipos y la calibración.',
    );
  }

  const comparison = await service.comparePosts({ postA, postB, archetypes, agents, icp });
  const explanation = explainComparison({
    comparison,
    scoresA: comparison.archetypeScores.a,
    scoresB: comparison.archetypeScores.b,
    agents,
    archetypes,
  });

  // La recomendación es la parte cara: una llamada más al modelo. Se puede
  // pedir sin ella cuando solo interesa el veredicto.
  const recommendation =
    withRecommendation && comparison.winner
      ? await buildRecommendation({
          explanation,
          winningPost: comparison.winner === 'A' ? postA : postB,
          icp,
        })
      : null;

  res.json({
    data: {
      audience: { archetypes: archetypes.length, agents: agents.length },
      comparison,
      explanation,
      recommendation,
    },
  });
}

module.exports = { compare };
