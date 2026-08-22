const { generatePopulation, allocateCounts } = require('../audience.population');

const context = {
  product: 'AI SDR para restaurantes',
  icp: 'Restaurantes de 5 a 50 empleados',
  industry: 'Food & beverage',
  location: 'Estados Unidos',
  buyer: 'Restaurant owner',
  goal: 'Conseguir demos',
};

const archetype = (id, overrides = {}) => ({
  id,
  label: `Arquetipo ${id}`,
  awareness: 'problem-aware',
  painPoints: ['pierde reservas'],
  objections: ['ya probé algo así'],
  priceSensitivity: 'medium',
  purchaseIntent: 50,
  sharePopulation: 0.25,
  ...overrides,
});

const fourArchetypes = ['a', 'b', 'c', 'd'].map((id) => archetype(id));

describe('allocateCounts', () => {
  it('reparte exactamente el tamaño pedido aunque los shares no sumen 1', () => {
    // El LLM devolvió shares que suman 1.10 — medido en una corrida real de Haiku.
    const inflated = [
      archetype('a', { sharePopulation: 0.4 }),
      archetype('b', { sharePopulation: 0.4 }),
      archetype('c', { sharePopulation: 0.3 }),
    ];

    const counts = allocateCounts(inflated, 200);

    expect(counts.reduce((s, c) => s + c, 0)).toBe(200);
  });

  it('reparte parejo si el modelo devolvió todos los shares en cero', () => {
    const zeroed = fourArchetypes.map((a) => ({ ...a, sharePopulation: 0 }));

    expect(allocateCounts(zeroed, 200)).toEqual([50, 50, 50, 50]);
  });

  it('no pierde agentes por redondeo con shares que no dividen exacto', () => {
    const three = ['a', 'b', 'c'].map((id) => archetype(id, { sharePopulation: 1 / 3 }));

    expect(allocateCounts(three, 100).reduce((s, c) => s + c, 0)).toBe(100);
  });
});

describe('generatePopulation', () => {
  const base = { archetypes: fourArchetypes, context, size: 200, seed: 'seed-1' };

  it('genera exactamente el tamaño pedido', () => {
    expect(generatePopulation(base).agents).toHaveLength(200);
  });

  it('es determinista: la misma semilla produce la misma población', () => {
    expect(generatePopulation(base).agents).toEqual(generatePopulation(base).agents);
  });

  it('semillas distintas producen poblaciones distintas', () => {
    const a = generatePopulation(base);
    const b = generatePopulation({ ...base, seed: 'seed-2' });

    expect(a.agents).not.toEqual(b.agents);
  });

  it('cada agente referencia su arquetipo de origen', () => {
    const { agents } = generatePopulation(base);

    expect(new Set(agents.map((a) => a.archetypeId))).toEqual(new Set(['a', 'b', 'c', 'd']));
  });

  it('la distribución por arquetipo es consultable y suma el total', () => {
    const { distribution } = generatePopulation(base);

    expect(distribution).toHaveLength(4);
    expect(distribution.reduce((s, d) => s + d.count, 0)).toBe(200);
  });

  it('varía los atributos continuos dentro del grupo', () => {
    const { agents } = generatePopulation(base);
    const intents = new Set(agents.filter((a) => a.archetypeId === 'a').map((a) => a.purchaseIntent));

    expect(intents.size).toBeGreaterThan(1);
  });

  it('NO varía los atributos estructurales: el grupo tiene que seguir siendo un grupo', () => {
    const { agents } = generatePopulation({
      ...base,
      archetypes: [
        archetype('a', { awareness: 'unaware', sharePopulation: 0.5 }),
        archetype('b', { awareness: 'product-aware', sharePopulation: 0.5 }),
      ],
    });

    const awarenessOfA = new Set(agents.filter((x) => x.archetypeId === 'a').map((x) => x.awareness));
    expect(awarenessOfA).toEqual(new Set(['unaware']));
  });

  it('mantiene la intención dentro de 0-100 aunque el arquetipo esté en el borde', () => {
    const { agents } = generatePopulation({
      ...base,
      archetypes: [archetype('a', { purchaseIntent: 100, sharePopulation: 1 })],
    });

    expect(agents.every((a) => a.purchaseIntent >= 0 && a.purchaseIntent <= 100)).toBe(true);
  });

  it('lleva la geografía como contexto en cada agente', () => {
    const { agents } = generatePopulation(base);

    expect(agents[0].market).toEqual({
      location: 'Estados Unidos',
      industry: 'Food & beverage',
      buyer: 'Restaurant owner',
    });
  });

  it('rechaza una entrada inválida en vez de generar una población silenciosamente rota', () => {
    expect(() => generatePopulation({ ...base, archetypes: [] })).toThrow();
  });
});
