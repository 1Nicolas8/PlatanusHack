/**
 * SIM-26 — mide si el simulador acierta, contra datos que nunca vio.
 *
 * La regla que hace valida la medicion: los posts de evaluacion NO participaron
 * de la calibracion. Si el mismo post que ajusto las tasas se usa para medir,
 * la accuracy que sale es la de haber memorizado, no la de predecir.
 *
 * Dos mediciones distintas, porque responden preguntas distintas:
 *
 *   pareada    dados dos posts, elige el que funciono mejor? Es la pregunta
 *              que el producto promete responder, y el baseline es 50%.
 *   por agente de los que predijo que reaccionarian, cuantos reaccionaron?
 *              Mide si el modelo distingue personas, no solo posts.
 */

const mean = (values) => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0);

/**
 * Precision y recall sobre los agentes que el modelo predijo como reactores.
 *
 * Se toman los N mas probables, donde N es la cantidad real de reacciones. Usar
 * un umbral fijo mezclaria dos errores — cuantos y quienes — y aca interesa
 * solo el segundo.
 */
function evaluateAgentRanking({ predictions, actualReactorIds }) {
  const actual = new Set(actualReactorIds.map(String));
  if (actual.size === 0) return null;

  const ranked = predictions
    .filter((p) => p.probability !== null)
    .sort((a, b) => b.probability - a.probability)
    .slice(0, actual.size);

  const hits = ranked.filter((p) => actual.has(String(p.agentId))).length;

  // Con que probabilidad acertaria eligiendo al azar la misma cantidad.
  const chance = actual.size / predictions.length;

  return {
    predicted: ranked.length,
    actual: actual.size,
    hits,
    precision: ranked.length ? Number((hits / ranked.length).toFixed(3)) : 0,
    chance: Number(chance.toFixed(3)),
    lift: chance > 0 ? Number((hits / ranked.length / chance).toFixed(2)) : null,
  };
}

/**
 * Acierto pareado: dados dos posts, el modelo elige el que realmente funciono
 * mejor? Es la medicion que el documento pide, con baseline de 50%.
 */
function evaluatePairs(postResults) {
  const pairs = [];

  for (let i = 0; i < postResults.length; i += 1) {
    for (let j = i + 1; j < postResults.length; j += 1) {
      const a = postResults[i];
      const b = postResults[j];

      // Un empate real no se puede acertar ni fallar: se excluye en vez de
      // contarlo como acierto, que inflaria la accuracy.
      if (a.actualReactions === b.actualReactions) continue;

      const actualWinner = a.actualReactions > b.actualReactions ? a.postId : b.postId;
      const predictedWinner = a.predictedScore > b.predictedScore ? a.postId : b.postId;

      pairs.push({
        pair: [a.postId, b.postId],
        actualWinner,
        predictedWinner,
        correct: actualWinner === predictedWinner,
        actual: [a.actualReactions, b.actualReactions],
        predicted: [Number(a.predictedScore.toFixed(2)), Number(b.predictedScore.toFixed(2))],
      });
    }
  }

  const correct = pairs.filter((p) => p.correct).length;

  return {
    pairs,
    total: pairs.length,
    correct,
    accuracy: pairs.length ? Number((correct / pairs.length).toFixed(3)) : null,
    baseline: 0.5,
  };
}

/**
 * Reporte completo.
 *
 * El nivel de confianza va atado al tamano de muestra y es deliberadamente
 * severo: con tres posts, cualquier accuracy es una pista. Presentar 100% sobre
 * tres pares como si fuera una medicion seria el error mas caro que podriamos
 * cometer frente a un jurado tecnico.
 */
function buildReport({ postResults }) {
  const pairing = evaluatePairs(postResults);
  const rankings = postResults.map((r) => r.ranking).filter(Boolean);

  const confidence =
    pairing.total >= 15
      ? 'media — suficiente para reportar una tendencia'
      : pairing.total >= 6
        ? 'baja — la accuracy es indicativa, no concluyente'
        : 'muy baja — con esta cantidad de pares el resultado es una pista, no una medicion';

  return {
    heldOutPosts: postResults.length,
    pairwise: pairing,
    agentRanking: rankings.length
      ? {
          posts: rankings.length,
          avgPrecision: Number(mean(rankings.map((r) => r.precision)).toFixed(3)),
          avgChance: Number(mean(rankings.map((r) => r.chance)).toFixed(3)),
          avgLift: Number(mean(rankings.map((r) => r.lift ?? 0)).toFixed(2)),
        }
      : null,
    confidence,
    caveat:
      'Los posts de evaluacion no participaron de la calibracion. Sin esa separacion la accuracy medira memoria y no prediccion.',
  };
}

module.exports = { evaluateAgentRanking, evaluatePairs, buildReport };
