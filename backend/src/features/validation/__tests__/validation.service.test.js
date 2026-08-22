const { evaluateAgentRanking, evaluatePairs, buildReport } = require('../validation.service');

const prediction = (agentId, probability) => ({ agentId, probability });

describe('evaluateAgentRanking', () => {
  const predictions = [
    prediction('a', 0.9),
    prediction('b', 0.7),
    prediction('c', 0.2),
    prediction('d', 0.1),
  ];

  it('toma tantos candidatos como reacciones reales hubo', () => {
    const result = evaluateAgentRanking({ predictions, actualReactorIds: ['a', 'b'] });

    expect(result.predicted).toBe(2);
    expect(result.hits).toBe(2);
    expect(result.precision).toBe(1);
  });

  it('calcula el lift contra elegir al azar', () => {
    const result = evaluateAgentRanking({ predictions, actualReactorIds: ['a', 'b'] });

    // 2 de 4 al azar daría 0.5 de precisión; acertar las 2 es 2x.
    expect(result.chance).toBe(0.5);
    expect(result.lift).toBe(2);
  });

  it('un modelo que ordena al revés queda por debajo del azar', () => {
    const result = evaluateAgentRanking({ predictions, actualReactorIds: ['c', 'd'] });

    expect(result.hits).toBe(0);
    expect(result.lift).toBe(0);
  });

  it('ignora agentes sin predicción en vez de contarlos como fallos', () => {
    const result = evaluateAgentRanking({
      predictions: [...predictions, prediction('e', null)],
      actualReactorIds: ['a'],
    });

    expect(result.predicted).toBe(1);
  });

  it('devuelve null si nadie reaccionó: no hay nada que medir', () => {
    expect(evaluateAgentRanking({ predictions, actualReactorIds: [] })).toBeNull();
  });
});

describe('evaluatePairs', () => {
  const post = (postId, actualReactions, predictedScore) => ({ postId, actualReactions, predictedScore });

  it('acierta cuando el orden predicho coincide con el real', () => {
    const result = evaluatePairs([post(8, 10, 3), post(9, 44, 9), post(10, 27, 6)]);

    expect(result.total).toBe(3);
    expect(result.correct).toBe(3);
    expect(result.accuracy).toBe(1);
  });

  it('un modelo que ordena al revés acierta cero, no la mitad', () => {
    // Real: 9 > 10 > 8. Predicho: 8 > 10 > 9. Los tres pares fallan.
    const result = evaluatePairs([post(8, 10, 9), post(9, 44, 3), post(10, 27, 6)]);

    expect(result.correct).toBe(0);
    expect(result.accuracy).toBe(0);
  });

  it('cuenta aciertos parciales', () => {
    // Real: 9 > 10 > 8. Predicho: 9 > 8 > 10. Acierta 8v9 y 9v10, falla 8v10.
    const result = evaluatePairs([post(8, 10, 6), post(9, 44, 9), post(10, 27, 3)]);

    expect(result.correct).toBe(2);
    expect(result.accuracy).toBeCloseTo(0.667, 2);
  });

  it('excluye los empates reales en vez de contarlos como acierto', () => {
    const result = evaluatePairs([post(8, 20, 3), post(9, 20, 9)]);

    expect(result.total).toBe(0);
    expect(result.accuracy).toBeNull();
  });

  it('el baseline siempre es el azar', () => {
    expect(evaluatePairs([post(1, 5, 1), post(2, 9, 2)]).baseline).toBe(0.5);
  });
});

describe('buildReport', () => {
  const results = [
    { postId: 8, actualReactions: 10, predictedScore: 3, ranking: { precision: 0.5, chance: 0.1, lift: 5 } },
    { postId: 9, actualReactions: 44, predictedScore: 9, ranking: { precision: 0.6, chance: 0.1, lift: 6 } },
    { postId: 10, actualReactions: 27, predictedScore: 6, ranking: { precision: 0.4, chance: 0.1, lift: 4 } },
  ];

  it('con pocos pares avisa que el resultado es una pista', () => {
    const report = buildReport({ postResults: results });

    expect(report.pairwise.accuracy).toBe(1);
    expect(report.confidence).toMatch(/muy baja/i);
  });

  it('promedia el lift por agente', () => {
    expect(buildReport({ postResults: results }).agentRanking.avgLift).toBe(5);
  });

  it('deja escrito por qué la medición es válida', () => {
    expect(buildReport({ postResults: results }).caveat).toMatch(/no participaron de la calibracion/i);
  });
});
