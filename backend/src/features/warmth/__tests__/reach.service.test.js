const { rankByReach, authorityFromHeadline, computeAmplification } = require('../reach.service');

describe('authorityFromHeadline', () => {
  it('detecta señales de audiencia propia', () => {
    expect(authorityFromHeadline('Founder & CEO at Acme').signals).toContain('fundador o C-level');
    expect(authorityFromHeadline('Podcast host | Speaker').signals).toContain('crea contenido');
  });

  it('un headline sin señales puntúa cero', () => {
    expect(authorityFromHeadline('Estudiante de ingeniería').score).toBe(0);
  });

  it('acumula señales sin pasarse de 100', () => {
    expect(authorityFromHeadline('Founder | Investor | Speaker | Head of Growth').score).toBeLessThanOrEqual(100);
  });
});

describe('computeAmplification', () => {
  it('atribuye el alcance externo a quienes interactuaron en ESE post', () => {
    const credit = computeAmplification({
      connectionIds: ['1', '2'],
      reactions: [
        { conexionId: 1, postId: 10, tipo: 'compartido' },
        { conexionId: 2, postId: 10, tipo: 'like' },
        ...Array.from({ length: 7 }, () => ({ conexionId: null, postId: 10, tipo: 'like' })),
      ],
    });

    // El que compartió (peso 6) se lleva más que el que dio like (peso 1).
    expect(credit.get('1')).toBeGreaterThan(credit.get('2'));
    expect(credit.get('1') + credit.get('2')).toBeCloseTo(7, 5);
  });

  it('sin alcance externo no atribuye nada: no hubo amplificación que repartir', () => {
    const credit = computeAmplification({
      connectionIds: ['1'],
      reactions: [{ conexionId: 1, postId: 10, tipo: 'compartido' }],
    });

    expect(credit.size).toBe(0);
  });
});

describe('rankByReach', () => {
  const connections = [
    { id: 1, nombre: 'Founder grande', headline: 'Founder & CEO | Speaker' },
    { id: 2, nombre: 'Dev normal', headline: 'Software Engineer' },
    { id: 3, nombre: 'Head of', headline: 'Head of Growth' },
  ];

  it('ordena por alcance: quien tiene audiencia propia va primero', () => {
    const { contacts } = rankByReach({ connections });

    expect(contacts[0].connectionId).toBe(1);
    expect(contacts[contacts.length - 1].connectionId).toBe(2);
  });

  it('avisa que sin seguidores el alcance es una heurística', () => {
    const { summary } = rankByReach({ connections });

    expect(summary.followersAvailable).toBe(false);
    expect(summary.note).toMatch(/heuristica declarada/i);
  });

  it('cuando hay seguidores reales, mandan sobre la heurística del headline', () => {
    const withFollowers = [
      { id: 1, nombre: 'Founder chico', headline: 'Founder & CEO', followers: 100 },
      { id: 2, nombre: 'Dev con audiencia', headline: 'Software Engineer', followers: 50000 },
    ];

    const { contacts, summary } = rankByReach({ connections: withFollowers });

    expect(summary.followersAvailable).toBe(true);
    expect(contacts[0].connectionId).toBe(2);
    expect(contacts[0].audienceSource).toBe('seguidores');
  });

  it('la amplificación observada sube a quien saca el post de la red', () => {
    const reactions = [
      { conexionId: 2, postId: 10, tipo: 'compartido' },
      ...Array.from({ length: 20 }, () => ({ conexionId: null, postId: 10, tipo: 'like' })),
    ];

    const { contacts } = rankByReach({ connections, reactions });
    const dev = contacts.find((c) => c.connectionId === 2);

    expect(dev.amplification).toBeGreaterThan(0);
  });

  it('funciona sin reacciones: la red se ordena igual', () => {
    expect(rankByReach({ connections }).contacts).toHaveLength(3);
  });
});
