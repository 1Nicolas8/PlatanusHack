const crypto = require('node:crypto');
const path = require('node:path');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

function parseInteger(value, label, { min = 0 } = {}) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min) throw new Error(`${label} debe ser un entero >= ${min}; se recibió ${value}.`);
  return parsed;
}

function parseOptions(argv, env) {
  const valueAfter = (flag) => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const threshold = parseInteger(valueAfter('--umbral') ?? env.UMBRAL_CALIBRACION ?? 2, 'UMBRAL');
  const seed = parseInteger(valueAfter('--semilla') ?? env.SEMILLA_POBLACION ?? 42, 'SEMILLA');
  return { threshold, seed };
}

function agentSeed(globalSeed, connectionId) {
  return crypto.createHash('sha256').update(`${globalSeed}:${connectionId}`).digest().readUInt32BE(0) & 0x7fffffff;
}

async function selectAll(query, label) {
  const { data, error } = await query;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

function buildPopulation(connections, reactions, threshold, seed) {
  const counts = new Map();
  const seenReactionIds = new Set();
  for (const reaction of reactions) {
    if (reaction.conexion_id === null || seenReactionIds.has(String(reaction.id))) continue;
    seenReactionIds.add(String(reaction.id));
    const key = String(reaction.conexion_id);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return connections.map((connection) => {
    const observed = counts.get(String(connection.id)) || 0;
    return {
      conexion_id: connection.id,
      arquetipo_id: connection.arquetipo_id,
      nivel: observed >= threshold ? 'calibrado' : 'prior',
      reacciones_observadas: observed,
      umbral_usado: threshold,
      semilla: agentSeed(seed, connection.id),
    };
  });
}

function summarize(population, threshold, seed) {
  const calibrated = population.filter(({ nivel }) => nivel === 'calibrado').length;
  const prior = population.length - calibrated;
  const percentage = (value) => Number(((value / population.length) * 100).toFixed(2));
  return {
    agentes_total: population.length,
    umbral: threshold,
    semilla_global: seed,
    calibrado: { cantidad: calibrated, porcentaje: percentage(calibrated) },
    prior: { cantidad: prior, porcentaje: percentage(prior) },
    diagnostico: prior > calibrated
      ? `La mayoría de la población está en nivel prior: ${prior} de ${population.length} agentes (${percentage(prior)}%).`
      : `La mayoría de la población está calibrada: ${calibrated} de ${population.length} agentes (${percentage(calibrated)}%).`,
  };
}

async function main() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en backend/.env.');
  const { threshold, seed } = parseOptions(process.argv.slice(2), process.env);
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const [connections, reactions] = await Promise.all([
    selectAll(supabase.from('conexiones').select('id,nombre,arquetipo_id').order('id'), 'No se pudieron leer conexiones'),
    selectAll(supabase.from('reacciones').select('id,conexion_id').not('conexion_id', 'is', null).order('id'), 'No se pudieron leer reacciones'),
  ]);
  if (connections.length !== 406) throw new Error(`Se esperaban 406 conexiones y se encontraron ${connections.length}.`);
  const population = buildPopulation(connections, reactions, threshold, seed);
  const { error } = await supabase.from('agentes_simulacion').upsert(population, { onConflict: 'conexion_id' });
  if (error) throw new Error(`No se pudo construir la población: ${error.message}`);

  const stored = await selectAll(supabase.from('agentes_simulacion').select('*').order('conexion_id'), 'No se pudo verificar la población');
  if (stored.length !== connections.length) throw new Error(`Verificación fallida: se esperaban ${connections.length} agentes y quedaron ${stored.length}.`);
  const expected = JSON.stringify(population.map((row) => ({
    ...row,
    conexion_id: String(row.conexion_id),
    arquetipo_id: row.arquetipo_id === null ? null : String(row.arquetipo_id),
  })));
  const actual = JSON.stringify(stored.map((row) => ({
    conexion_id: String(row.conexion_id),
    arquetipo_id: row.arquetipo_id === null ? null : String(row.arquetipo_id),
    nivel: row.nivel,
    reacciones_observadas: row.reacciones_observadas,
    umbral_usado: row.umbral_usado,
    semilla: row.semilla,
  })));
  if (expected !== actual) throw new Error('La población almacenada no coincide con la población determinista esperada.');
  console.info(JSON.stringify(summarize(population, threshold, seed), null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { parseOptions, agentSeed, buildPopulation, summarize };
