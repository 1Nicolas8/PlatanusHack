const { predictPost, comparePosts, toModifier } = require('../scoring.service');

const archetypes = [
  { id: '1', label: 'Founders', awareness: 'solution-aware' },
  { id: '2', label: 'Estudiantes', awareness: 'unaware' },
];

const agents = [
  { id: 'a1', archetypeId: '1', tasaCalibrada: 0.4 },
  { id: 'a2', archetypeId: '1', tasaCalibrada: 0.1 },
  { id: 'a3', archetypeId: '2', tasaCalibrada: 0.05 },
];

const score = (archetypeId, socialEngagement, commercialIntent) => ({
  archetypeId,
  attention: socialEngagement,
  relevance: socialEngagement,
  credibility: socialEngagement,
  socialEngagement,
  commercialIntent,
  reasoning: 'motivo',
});

const scorerReturning = (scores) => ({ scorePost: jest.fn().mockResolvedValue(scores) });

describe('toModifier', () => {
  it('50 es neutro: no cambia la tasa base', () => {
    expect(toModifier(50)).toBe(1);
  });

  it('está acotado: un score extremo no dispara la predicción al infinito', () => {
    expect(toModifier(100)).toBeLessThanOrEqual(2.5);
    expect(toModifier(0)).toBeGreaterThan(0);
  });
});

describe('predictPost', () => {
  it('multiplica la tasa base del historial por el modificador del contenido', async () => {
    const scorer = scorerReturning([score('1', 100, 80), score('2', 50, 20)]);

    const result = await predictPost({ post: 'x', archetypes, agents, scorer });
    const a1 = result.predictions.find((p) => p.agentId === 'a1');

    expect(a1.baseRate).toBe(0.4);
    expect(a1.modifier).toBe(2);
    expect(a1.probability).toBe(0.8);
  });

  it('nunca predice una probabilidad mayor a 1', async () => {
    const scorer = scorerReturning([score('1', 100, 90), score('2', 100, 90)]);

    const result = await predictPost({
      post: 'x',
      archetypes,
      agents: [{ id: 'a1', archetypeId: '1', tasaCalibrada: 0.9 }],
      scorer,
    });

    expect(result.predictions[0].probability).toBe(1);
  });

  it('marca los agentes cuyo arquetipo el modelo no puntuó en vez de asumirlos neutros', async () => {
    const scorer = scorerReturning([score('1', 60, 50)]);

    const result = await predictPost({ post: 'x', archetypes, agents, scorer });

    expect(result.summary.unscoredAgents).toBe(1);
    expect(result.predictions.find((p) => p.agentId === 'a3').probability).toBeNull();
  });

  it('reporta el spread: si el modelo puntúa todo igual, no está discriminando', async () => {
    const flat = scorerReturning([score('1', 70, 50), score('2', 70, 50)]);

    const result = await predictPost({ post: 'x', archetypes, agents, scorer: flat });

    expect(result.summary.scoreSpread).toBe(0);
  });

  it('lleva la fuente de los arquetipos: red real o ICP sintético', async () => {
    const scorer = scorerReturning([score('1', 60, 50), score('2', 40, 30)]);

    const result = await predictPost({ post: 'x', archetypes, agents, scorer, source: 'icp' });

    expect(result.source).toBe('icp');
  });
});

describe('comparePosts', () => {
  it('declara ganador cuando la diferencia supera el ruido', async () => {
    const scorer = {
      scorePost: jest
        .fn()
        .mockResolvedValueOnce([score('1', 90, 80), score('2', 30, 20)])
        .mockResolvedValueOnce([score('1', 40, 30), score('2', 20, 10)]),
    };

    const result = await comparePosts({ postA: 'a', postB: 'b', archetypes, agents, scorer });

    expect(result.winner).toBe('A');
    expect(result.verdict).toMatch(/Gana A/);
  });

  it('NO declara ganador si la diferencia está dentro del ruido', async () => {
    const scorer = {
      scorePost: jest
        .fn()
        .mockResolvedValueOnce([score('1', 60, 50), score('2', 58, 49)])
        .mockResolvedValueOnce([score('1', 60, 50), score('2', 58, 49)]),
    };

    const result = await comparePosts({ postA: 'a', postB: 'b', archetypes, agents, scorer });

    expect(result.winner).toBeNull();
    expect(result.verdict).toMatch(/dentro del ruido/i);
  });

  it('gana por intención comercial aunque el otro enganche más', async () => {
    const scorer = {
      // A engancha más pero vende menos; B engancha menos y vende más.
      scorePost: jest
        .fn()
        .mockResolvedValueOnce([score('1', 95, 20), score('2', 90, 15)])
        .mockResolvedValueOnce([score('1', 40, 85), score('2', 35, 80)]),
    };

    const result = await comparePosts({ postA: 'a', postB: 'b', archetypes, agents, scorer });

    expect(result.winner).toBe('B');
  });
});
