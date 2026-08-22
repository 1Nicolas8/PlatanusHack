const {
  assignArchetype, coerceArchetypePayload, responseSchema, summarize: summarizeArchetypes,
} = require('../generar-arquetipos');
const { agentSeed, buildPopulation, parseOptions, summarize } = require('../construir-poblacion');

const archetype = (nombre, keywords) => ({
  nombre,
  keywords,
  descripcion: 'Descripción suficientemente extensa del grupo profesional.',
  awareness: 'Conoce el problema y evalúa soluciones concretas.',
  objeciones: 'Exige evidencia antes de adoptar una solución nueva.',
  pain_points: 'Tiene procesos manuales y poco tiempo disponible.',
  sensibilidad_precio: 'Compara el precio con el retorno esperado.',
  intencion_compra: 'Compraría si observa valor medible para su trabajo.',
});

test('valida entre 8 y 12 arquetipos con nombres únicos', () => {
  const arquetipos = Array.from({ length: 8 }, (_, index) => archetype(`Grupo ${index}`, [`keyword ${index}`, 'software', 'data', 'ia', 'rrhh', 'finanzas', 'diseño', 'founder']));
  expect(responseSchema.parse({ arquetipos }).arquetipos).toHaveLength(8);
  expect(() => responseSchema.parse({ arquetipos: arquetipos.slice(0, 7) })).toThrow();
});

test('asigna por keywords y usa desempate estable sin dejar conexiones sueltas', () => {
  const archetypes = [archetype('Ingeniería', ['software engineer']), archetype('Diseño', ['product designer'])];
  expect(assignArchetype({ id: 1, headline: 'Senior Software Engineer' }, archetypes).archetype.nombre).toBe('Ingeniería');
  const first = assignArchetype({ id: 2, headline: null }, archetypes);
  const second = assignArchetype({ id: 2, headline: null }, archetypes);
  expect(first.method).toBe('desempate_estable');
  expect(first.archetype.nombre).toBe(second.archetype.nombre);
});

test('normaliza arquetipos serializados, anidados e indexados sin relajar el schema', () => {
  const archetypes = Array.from({ length: 8 }, (_, index) => archetype(`Grupo ${index}`, [`keyword ${index}`]));
  expect(coerceArchetypePayload({ arquetipos: JSON.stringify(archetypes) }).arquetipos).toEqual(archetypes);
  expect(coerceArchetypePayload({ arquetipos: { arquetipos: archetypes } }).arquetipos).toEqual(archetypes);
  expect(coerceArchetypePayload({ arquetipos: Object.fromEntries(archetypes.map((item, index) => [index, item])) }).arquetipos).toEqual(archetypes);
});

test('distingue asignaciones existentes de coincidencias por keywords', () => {
  const archetypes = [archetype('Ingeniería', ['software']), archetype('Diseño', ['designer'])];
  const connections = [{ id: 1 }, { id: 2 }];
  const assignments = archetypes.map((item) => ({ archetype: item, method: 'existente' }));
  expect(summarizeArchetypes(connections, archetypes, assignments).asignacion).toEqual({
    por_keywords: 0,
    desempate_estable: 0,
    existentes: 2,
    no_asignadas: [],
  });
});

test('construye un agente por conexión y cuenta reacciones distintas', () => {
  const connections = [
    { id: 1, nombre: 'A', arquetipo_id: 10 },
    { id: 2, nombre: 'B', arquetipo_id: 20 },
  ];
  const reactions = [
    { id: 100, conexion_id: 1 }, { id: 100, conexion_id: 1 }, { id: 101, conexion_id: 1 },
  ];
  const population = buildPopulation(connections, reactions, 2, 42);
  expect(population.map(({ nivel, reacciones_observadas }) => ({ nivel, reacciones_observadas }))).toEqual([
    { nivel: 'calibrado', reacciones_observadas: 2 },
    { nivel: 'prior', reacciones_observadas: 0 },
  ]);
  expect(population[0].semilla).toBe(agentSeed(42, 1));
  expect(summarize(population, 2, 42).diagnostico).toContain('mayoría');
});

test('acepta umbral y semilla por argumento con precedencia sobre env', () => {
  expect(parseOptions(['--umbral', '3', '--semilla', '99'], { UMBRAL_CALIBRACION: '4' })).toEqual({ threshold: 3, seed: 99 });
  expect(() => parseOptions(['--umbral', '-1'], {})).toThrow('UMBRAL');
});
