const { computeWarmth, buildQuadrants, recencyFactor } = require('../warmth.service');

const posts = [
  { id: 1, ordenCronologico: 1, fecha: null },
  { id: 2, ordenCronologico: 5, fecha: null },
  { id: 3, ordenCronologico: 10, fecha: null },
];

const connection = (id, overrides = {}) => ({
  id,
  nombre: `Contacto ${id}`,
  headline: 'Owner at Resto',
  fechaContacto: '2026-01-01',
  arquetipoId: 1,
  ...overrides,
});

describe('recencyFactor', () => {
  it('el post más reciente pesa completo', () => {
    expect(recencyFactor(10, 10)).toBe(1);
  });

  it('cinco posts hacia atrás vale la mitad', () => {
    expect(recencyFactor(5, 10)).toBeCloseTo(0.5, 5);
  });

  it('nunca es negativo ni crece si el orden es mayor al último', () => {
    expect(recencyFactor(12, 10)).toBe(1);
  });
});

describe('computeWarmth', () => {
  const connections = [connection(1), connection(2), connection(3)];

  it('un comentario pesa más que un like en el mismo post', () => {
    const result = computeWarmth({
      connections,
      posts,
      reactions: [
        { conexionId: 1, postId: 3, tipo: 'comentario' },
        { conexionId: 2, postId: 3, tipo: 'like' },
      ],
    });

    const c1 = result.contacts.find((c) => c.connectionId === 1);
    const c2 = result.contacts.find((c) => c.connectionId === 2);
    expect(c1.score).toBeGreaterThan(c2.score);
  });

  it('una interacción vieja pesa menos que la misma interacción reciente', () => {
    const result = computeWarmth({
      connections,
      posts,
      reactions: [
        { conexionId: 1, postId: 3, tipo: 'like' },
        { conexionId: 2, postId: 1, tipo: 'like' },
      ],
    });

    const reciente = result.contacts.find((c) => c.connectionId === 1);
    const vieja = result.contacts.find((c) => c.connectionId === 2);
    expect(reciente.score).toBeGreaterThan(vieja.score);
  });

  it('los contactos sin interacción aparecen igual, en el anillo frío', () => {
    const result = computeWarmth({ connections, posts, reactions: [] });

    expect(result.contacts).toHaveLength(3);
    expect(result.contacts.every((c) => c.ring === 5 && c.label === 'frio')).toBe(true);
    expect(result.summary.neverInteracted).toBe(3);
  });

  it('cuenta aparte las reacciones de gente fuera de la red', () => {
    const result = computeWarmth({
      connections,
      posts,
      reactions: [
        { conexionId: 1, postId: 3, tipo: 'like' },
        { conexionId: null, postId: 3, tipo: 'like' },
        { conexionId: 999, postId: 3, tipo: 'comentario' },
      ],
    });

    expect(result.summary.reactionsFromOutsideNetwork).toBe(2);
  });

  it('avisa cuando NO puede normalizar por oportunidad', () => {
    const result = computeWarmth({ connections, posts, reactions: [] });

    expect(result.summary.opportunityNormalized).toBe(false);
    expect(result.summary.note).toMatch(/no tienen fecha/i);
  });

  it('normaliza por oportunidad cuando los posts sí tienen fecha', () => {
    const dated = [
      { id: 1, ordenCronologico: 1, fecha: '2026-01-10' },
      { id: 2, ordenCronologico: 2, fecha: '2026-06-10' },
    ];
    const result = computeWarmth({
      posts: dated,
      // El viejo pudo ver los dos posts; el nuevo, solo uno.
      connections: [connection(1, { fechaContacto: '2026-01-01' }), connection(2, { fechaContacto: '2026-06-01' })],
      reactions: [
        { conexionId: 1, postId: 2, tipo: 'like' },
        { conexionId: 2, postId: 2, tipo: 'like' },
      ],
    });

    const antiguo = result.contacts.find((c) => c.connectionId === 1);
    const nuevo = result.contacts.find((c) => c.connectionId === 2);

    expect(result.summary.opportunityNormalized).toBe(true);
    expect(antiguo.opportunity).toBe(2);
    expect(nuevo.opportunity).toBe(1);
    // Misma interacción, pero el nuevo aprovechó todo lo que pudo ver.
    expect(nuevo.score).toBeGreaterThan(antiguo.score);
  });

  it('expone los pesos usados: un score sin definición no es interpretable', () => {
    const result = computeWarmth({ connections, posts, reactions: [] });

    expect(result.weights.comentario).toBe(4);
    expect(result.weights.recencyHalfLifePosts).toBe(5);
  });
});

describe('buildQuadrants', () => {
  const contacts = [
    { connectionId: 1, ring: 1, score: 9, headline: 'Owner at Resto' },
    { connectionId: 2, ring: 5, score: 0, headline: 'Owner at Bistro' },
    { connectionId: 3, ring: 1, score: 8, headline: 'Engineer at Tech' },
    { connectionId: 4, ring: 5, score: 0, headline: 'Engineer at Tech' },
  ];
  const isIcp = (c) => /Resto|Bistro/.test(c.headline);

  it('clasifica en los cuatro cuadrantes', () => {
    const { counts } = buildQuadrants({ contacts, isIcp });

    expect(counts).toEqual({ icpWarm: 1, icpCold: 1, otherWarm: 1, otherCold: 1 });
  });

  it('la lista accionable son los ICP fríos', () => {
    const { actionable } = buildQuadrants({ contacts, isIcp });

    expect(actionable.map((c) => c.connectionId)).toEqual([2]);
  });

  it('avisa cuando la red no tiene al comprador', () => {
    const { verdict } = buildQuadrants({ contacts, isIcp: () => false });

    expect(verdict).toMatch(/no tiene a tu comprador/i);
  });

  it('avisa cuando la audiencia activa no es el ICP', () => {
    const skewed = [
      { connectionId: 1, ring: 5, score: 0, headline: 'Owner at Resto' },
      ...[2, 3, 4, 5, 6].map((id) => ({ connectionId: id, ring: 1, score: 5, headline: 'Engineer' })),
    ];
    const { verdict } = buildQuadrants({ contacts: skewed, isIcp: (c) => /Resto/.test(c.headline) });

    expect(verdict).toMatch(/no es tu ICP/i);
  });
});
