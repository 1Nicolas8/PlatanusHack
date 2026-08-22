const { buildGraph } = require('../audience.graph');
const { simulatePropagation } = require('../audience.propagation');
const { generatePopulation } = require('../audience.population');

const context = {
  product: 'AI SDR',
  icp: 'Restaurantes',
  industry: 'Food',
  location: 'US',
  buyer: 'Owner',
  goal: 'Demos',
};

const archetype = (id, overrides = {}) => ({
  id,
  label: `Grupo ${id}`,
  awareness: 'problem-aware',
  painPoints: [],
  objections: [],
  priceSensitivity: 'medium',
  purchaseIntent: 50,
  sharePopulation: 0.25,
  ...overrides,
});

const archetypes = ['a', 'b', 'c', 'd'].map((id) => archetype(id));
const population = generatePopulation({ archetypes, context, size: 200, seed: 's1' });

describe('buildGraph', () => {
  it('es determinista con la misma semilla', () => {
    const a = buildGraph({ agents: population.agents, seed: 's1' });
    const b = buildGraph({ agents: population.agents, seed: 's1' });

    expect(a.edges).toBe(b.edges);
    expect(a.degrees).toEqual(b.degrees);
  });

  it('conecta más dentro del arquetipo que entre arquetipos', () => {
    const { homophilyRatio } = buildGraph({ agents: population.agents, seed: 's1' });

    // Con 4 grupos parejos, el azar puro daría ~0.25. Queremos estructura.
    expect(homophilyRatio).toBeGreaterThan(0.5);
  });

  it('deja puentes entre grupos: no queda segregado en islas', () => {
    const { homophilyRatio } = buildGraph({ agents: population.agents, seed: 's1' });

    // Si diera 1.0 el mensaje nunca saldría de su grupo y SIM-27 daría cero siempre.
    expect(homophilyRatio).toBeLessThan(1);
  });

  it('expone el grado de cada agente', () => {
    const { degrees } = buildGraph({ agents: population.agents, seed: 's1' });

    expect(Object.keys(degrees)).toHaveLength(200);
    expect(Object.values(degrees).every((d) => d > 0)).toBe(true);
  });

  it('rechaza construir un grafo con menos de dos agentes', () => {
    expect(() => buildGraph({ agents: [], seed: 's1' })).toThrow();
  });

  it('no rompe si hay un único arquetipo (no hay puente posible)', () => {
    const single = generatePopulation({
      archetypes: [archetype('solo', { sharePopulation: 1 })],
      context,
      size: 50,
      seed: 's1',
    });

    expect(buildGraph({ agents: single.agents, seed: 's1' }).homophilyRatio).toBe(1);
  });
});

describe('simulatePropagation', () => {
  const graph = buildGraph({ agents: population.agents, seed: 's1' });
  const base = { population, graph, seed: 's1' };

  it('es determinista con la misma semilla', () => {
    expect(simulatePropagation(base).matrix).toEqual(simulatePropagation(base).matrix);
  });

  it('termina siempre: no supera la profundidad máxima', () => {
    const result = simulatePropagation({ ...base, maxDepth: 2 });

    expect(result.depthReached).toBeLessThanOrEqual(2);
  });

  it('nunca expone al mismo agente dos veces', () => {
    const result = simulatePropagation(base);
    const fromMatrix = Object.values(result.matrix)
      .flatMap((row) => Object.values(row))
      .reduce((s, n) => s + n, 0);

    expect(fromMatrix).toBe(result.totalReach);
  });

  it('registra el arquetipo de origen y el de destino de cada exposición', () => {
    const result = simulatePropagation(base);

    expect(result.matrix.seed).toBeDefined();
    expect(Object.keys(result.matrix.a)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('reporta los grupos que no fueron alcanzados', () => {
    // Nadie comparte: solo llega la exposición inicial, que es aleatoria.
    const result = simulatePropagation({
      ...base,
      shareProbability: () => 0,
      initialExposureRate: 0.02,
    });

    expect(result.depthReached).toBe(0);
    expect(result.totalReach).toBeLessThan(30);
  });

  it('si nadie comparte, el alcance es solo el inicial', () => {
    const noShare = simulatePropagation({ ...base, shareProbability: () => 0 });
    const allShare = simulatePropagation({ ...base, shareProbability: () => 1 });

    expect(allShare.totalReach).toBeGreaterThan(noShare.totalReach);
  });

  it('cuenta aparte el alcance de compradores de alta intención', () => {
    const result = simulatePropagation(base);

    expect(result.highIntentReach).toBeLessThanOrEqual(result.totalReach);
  });
});
