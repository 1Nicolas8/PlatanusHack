jest.mock('../../../config/env', () => ({ ANTHROPIC_API_KEY: 'test-key' }));

const { buildRecommendation, verifyRecommendation } = require('../scoring.recommend');

const explanation = {
  winner: 'B',
  drivers: [
    { label: 'Desarrolladores', sharePct: 18, population: 74, scoreWinner: 68, reason: 'reconocen el problema' },
  ],
  tradeoff: [{ archetype: 'Diseñadores UX', sharePct: 6, gap: 12 }],
};

const fakeClient = (output) => ({
  messages: { parse: jest.fn().mockResolvedValue({ parsed_output: output }) },
});

const recommendation = {
  change: 'Agregar el impacto en tiempo de diseño',
  rationale: 'ataca el gap de Diseñadores UX',
  rewrittenPost: 'texto reescrito',
  targetsArchetypes: ['Diseñadores UX'],
};

describe('buildRecommendation', () => {
  it('pasa al modelo los gaps medidos, no una consigna genérica', async () => {
    const client = fakeClient(recommendation);

    await buildRecommendation({ explanation, winningPost: 'original', icp: 'founders', client });

    const prompt = client.messages.parse.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain('Diseñadores UX');
    expect(prompt).toContain('LO QUE YA FUNCIONA');
    expect(prompt).toContain('reconocen el problema');
  });

  it('devuelve un post completo listo para volver a simular', async () => {
    const client = fakeClient(recommendation);

    const result = await buildRecommendation({ explanation, winningPost: 'original', client });

    expect(result.rewrittenPost).toBe('texto reescrito');
    expect(result.change).toBeTruthy();
  });

  it('registra sobre cuántas evidencias se apoyó', async () => {
    const client = fakeClient(recommendation);

    const result = await buildRecommendation({ explanation, winningPost: 'original', client });

    expect(result.basedOn).toEqual({ strengths: 1, gaps: 1 });
  });

  it('sin ganador no recomienda: no hay base sobre la cual hacerlo', async () => {
    const result = await buildRecommendation({
      explanation: { winner: null, drivers: [], tradeoff: [] },
      winningPost: 'original',
    });

    expect(result.change).toBeNull();
    expect(result.note).toMatch(/seria adivinar/i);
  });
});

describe('verifyRecommendation', () => {
  const args = { original: 'orig', rewritten: 'nuevo', archetypes: [], agents: [], icp: 'x' };

  it('confirma cuando la reescritura gana', async () => {
    const comparePosts = jest.fn().mockResolvedValue({
      winner: 'A',
      deltaCommercialIntent: 4.2,
      a: { commerciallyRelevantReach: 14 },
      b: { commerciallyRelevantReach: 10 },
    });

    const result = await verifyRecommendation({ ...args, comparePosts });

    expect(result.improved).toBe(true);
    expect(result.verdict).toMatch(/supera al original/i);
  });

  it('avisa cuando la reescritura EMPEORA el original', async () => {
    const comparePosts = jest.fn().mockResolvedValue({
      winner: 'B',
      deltaCommercialIntent: -5,
      a: { commerciallyRelevantReach: 8 },
      b: { commerciallyRelevantReach: 13 },
    });

    const result = await verifyRecommendation({ ...args, comparePosts });

    expect(result.improved).toBe(false);
    expect(result.verdict).toMatch(/EMPEORA/);
  });

  it('avisa cuando el cambio no mueve la aguja', async () => {
    const comparePosts = jest.fn().mockResolvedValue({
      winner: null,
      deltaCommercialIntent: 0.3,
      a: { commerciallyRelevantReach: 11 },
      b: { commerciallyRelevantReach: 10.7 },
    });

    const result = await verifyRecommendation({ ...args, comparePosts });

    expect(result.decisive).toBe(false);
    expect(result.verdict).toMatch(/dentro del ruido/i);
  });

  it('compara la reescritura contra el original, no contra un tercero', async () => {
    const comparePosts = jest.fn().mockResolvedValue({ winner: 'A', deltaCommercialIntent: 1, a: {}, b: {} });

    await verifyRecommendation({ ...args, comparePosts });

    expect(comparePosts).toHaveBeenCalledWith(expect.objectContaining({ postA: 'nuevo', postB: 'orig' }));
  });
});
