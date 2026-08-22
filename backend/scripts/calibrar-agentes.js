const crypto = require('node:crypto');
const path = require('node:path');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const TOTAL_AGENTES_ESPERADO = 406;
const PCT_EN_RED_DEFAULT = 40;
const K_DEFAULT = 5;

function parseNumber(value, label, { min, max, exclusiveMin = false } = {}) {
  const parsed = Number(value);
  const belowMin = min !== undefined && (exclusiveMin ? parsed <= min : parsed < min);
  if (!Number.isFinite(parsed) || belowMin || (max !== undefined && parsed > max)) {
    throw new Error(`${label} fuera de rango: ${value}.`);
  }
  return parsed;
}

function parseOptions(argv, env) {
  const valueAfter = (flag) => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const esquema = valueAfter('--esquema') ?? env.ESQUEMA_PARTICION ?? 'temporal';
  const pctEnRed = parseNumber(valueAfter('--pct-en-red') ?? env.PCT_EN_RED_SUPUESTO ?? PCT_EN_RED_DEFAULT, 'PCT_EN_RED', { min: 0, max: 100 });
  const k = parseNumber(valueAfter('--k') ?? env.FUERZA_PRIOR ?? K_DEFAULT, 'K', { min: 0, exclusiveMin: true });
  return { esquema, pctEnRed, k, alcanceHabilitado: !argv.includes('--sin-alcance') };
}

function assumptionLabel({ alcanceHabilitado, pctEnRed }) {
  return alcanceHabilitado
    ? `Aproximación uniforme: impresiones_en_red/406; cuando pct_en_red falta se imputa ${pctEnRed}% a partir del post medido.`
    : 'Modelo de alcance apagado: exposure_prob=1 para todo par agente-post.';
}

function runId(options) {
  const config = JSON.stringify({ esquema: options.esquema, alcance: options.alcanceHabilitado, pctEnRed: options.pctEnRed, k: options.k });
  return crypto.createHash('sha256').update(config).digest('hex').slice(0, 24);
}

function calculatePostExposure(post, options, populationSize) {
  if (!options.alcanceHabilitado) {
    return { exposureProb: 1, impresionesEnRed: populationSize, fuenteAlcance: 'modelo_apagado' };
  }
  if (!Number.isFinite(Number(post.impresiones)) || Number(post.impresiones) < 0) {
    throw new Error(`El post ${post.id} no tiene impresiones válidas.`);
  }
  const measuredPct = post.pct_en_red === null ? null : Number(post.pct_en_red);
  const pct = measuredPct ?? options.pctEnRed;
  const impresionesEnRed = Number(post.impresiones) * pct / 100;
  return {
    exposureProb: Math.min(1, impresionesEnRed / populationSize),
    impresionesEnRed,
    fuenteAlcance: measuredPct === null ? 'pct_en_red_imputado' : 'pct_en_red_medido',
  };
}

function buildCalibration(agents, posts, reactions, options) {
  const assumption = assumptionLabel(options);
  const reactedPairs = new Set(reactions
    .filter(({ conexion_id: connectionId }) => connectionId !== null)
    .map(({ conexion_id: connectionId, post_id: postId }) => `${connectionId}:${postId}`));
  const postExposure = new Map(posts.map((post) => [String(post.id), calculatePostExposure(post, options, agents.length)]));
  const exposures = [];
  const evidence = new Map();
  const archetypeTotals = new Map();

  for (const agent of agents) {
    const agentEvidence = { successes: 0, failures: 0 };
    for (const post of posts) {
      const exposure = postExposure.get(String(post.id));
      const reacted = reactedPairs.has(`${agent.conexion_id}:${post.id}`);
      if (reacted) agentEvidence.successes += 1;
      else agentEvidence.failures += exposure.exposureProb;
      exposures.push({
        agente_id: agent.id,
        post_id: post.id,
        exposure_prob: exposure.exposureProb,
        impresiones_en_red: exposure.impresionesEnRed,
        fuente_alcance: exposure.fuenteAlcance,
        supuesto_alcance: assumption,
      });
    }
    evidence.set(String(agent.id), agentEvidence);
    const archetypeKey = String(agent.arquetipo_id);
    const total = archetypeTotals.get(archetypeKey) ?? { successes: 0, exposure: 0 };
    total.successes += agentEvidence.successes;
    total.exposure += posts.reduce((sum, post) => sum + postExposure.get(String(post.id)).exposureProb, 0);
    archetypeTotals.set(archetypeKey, total);
  }

  const archetypeRates = new Map([...archetypeTotals].map(([id, totals]) => [id, totals.exposure === 0 ? 0 : totals.successes / totals.exposure]));
  const calibrations = agents.map((agent) => {
    const agentEvidence = evidence.get(String(agent.id));
    const archetypeRate = archetypeRates.get(String(agent.arquetipo_id));
    const calibratedRate = (archetypeRate * options.k + agentEvidence.successes)
      / (options.k + agentEvidence.successes + agentEvidence.failures);
    return {
      agente_id: agent.id,
      tasa_calibrada: calibratedRate,
      tasa_arquetipo: archetypeRate,
      exitos: agentEvidence.successes,
      fallos_ponderados: agentEvidence.failures,
      k_usado: options.k,
      esquema_particion: options.esquema,
      supuesto_alcance: assumption,
    };
  });
  return { exposures, calibrations, archetypeRates };
}

async function select(query, label) {
  const { data, error } = await query;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

async function mutate(query, label) {
  const { error } = await query;
  if (error) throw new Error(`${label}: ${error.message}`);
}

async function upsertBatches(supabase, table, rows, conflict, label) {
  for (let index = 0; index < rows.length; index += 500) {
    await mutate(supabase.from(table).upsert(rows.slice(index, index + 500), { onConflict: conflict }), label);
  }
}

async function loadInputs(supabase, esquema) {
  const partitions = await select(
    supabase.from('particiones_posts').select('post_id,rol').eq('esquema', esquema).order('post_id'),
    'No se pudo leer la partición',
  );
  if (partitions.length === 0) throw new Error(`El esquema de partición ${esquema} no existe.`);
  const calibrationIds = partitions.filter(({ rol }) => rol === 'calibracion').map(({ post_id: postId }) => postId);
  if (calibrationIds.length === 0) throw new Error(`El esquema ${esquema} no tiene posts de calibración.`);
  const evaluationIds = new Set(partitions.filter(({ rol }) => rol === 'evaluacion').map(({ post_id: postId }) => String(postId)));
  const [agents, posts, reactions, archetypes] = await Promise.all([
    select(supabase.from('agentes_simulacion').select('id,conexion_id,arquetipo_id,nivel').order('id'), 'No se pudieron leer los agentes'),
    select(supabase.from('posts').select('id,orden_cronologico,impresiones,pct_en_red').in('id', calibrationIds).order('orden_cronologico'), 'No se pudieron leer los posts de calibración'),
    select(supabase.from('reacciones').select('post_id,conexion_id').in('post_id', calibrationIds).not('conexion_id', 'is', null), 'No se pudieron leer las reacciones de calibración'),
    select(supabase.from('arquetipos').select('id,nombre').order('nombre'), 'No se pudieron leer los arquetipos'),
  ]);
  if (agents.length !== TOTAL_AGENTES_ESPERADO) throw new Error(`Se esperaban ${TOTAL_AGENTES_ESPERADO} agentes y se encontraron ${agents.length}.`);
  if (agents.some(({ arquetipo_id: archetypeId }) => archetypeId === null)) throw new Error('Hay agentes sin arquetipo; no se puede calibrar.');
  if (reactions.some(({ post_id: postId }) => evaluationIds.has(String(postId)))) throw new Error('Una reacción de evaluación contaminó los datos de calibración.');
  return { agents, posts, reactions, archetypes, calibrationIds, partitions };
}

async function persistRun(supabase, options, result) {
  const id = runId(options);
  const assumption = assumptionLabel(options);
  await mutate(supabase.from('corridas_calibracion').upsert({
    id,
    esquema_particion: options.esquema,
    modelo_alcance_habilitado: options.alcanceHabilitado,
    pct_en_red_supuesto: options.pctEnRed,
    fuerza_prior: options.k,
    supuesto_alcance: assumption,
    updated_at: new Date().toISOString(),
  }), 'No se pudo registrar la corrida');
  await mutate(supabase.from('alcances_agentes_posts').delete().eq('corrida_id', id), 'No se pudieron reemplazar los alcances');
  await mutate(supabase.from('calibraciones_agentes').delete().eq('corrida_id', id), 'No se pudieron reemplazar las calibraciones');
  await upsertBatches(supabase, 'alcances_agentes_posts', result.exposures.map((row) => ({ ...row, corrida_id: id })), 'corrida_id,agente_id,post_id', 'No se pudieron guardar los alcances');
  await upsertBatches(supabase, 'calibraciones_agentes', result.calibrations.map((row) => ({ ...row, corrida_id: id })), 'corrida_id,agente_id', 'No se pudieron guardar las calibraciones');
  return id;
}

function summarize(inputs, options, result, id) {
  const archetypeNames = new Map(inputs.archetypes.map(({ id: archetypeId, nombre }) => [String(archetypeId), nombre]));
  const agentById = new Map(inputs.agents.map((agent) => [String(agent.id), agent]));
  const archetypeRates = [...result.archetypeRates]
    .map(([archetypeId, rate]) => ({ arquetipo: archetypeNames.get(archetypeId), tasa_base: rate }))
    .sort((left, right) => right.tasa_base - left.tasa_base || left.arquetipo.localeCompare(right.arquetipo, 'es'));
  const top10 = [...result.calibrations]
    .sort((left, right) => right.tasa_calibrada - left.tasa_calibrada || Number(left.agente_id) - Number(right.agente_id))
    .slice(0, 10)
    .map((row) => ({ ...row, nivel: agentById.get(String(row.agente_id)).nivel }));
  const priorDeviations = result.calibrations
    .filter((row) => agentById.get(String(row.agente_id)).nivel === 'prior')
    .map((row) => Math.abs(row.tasa_calibrada - row.tasa_arquetipo));
  return {
    corrida_id: id,
    esquema_particion: options.esquema,
    posts_calibracion: inputs.posts.map(({ orden_cronologico: order }) => order),
    posts_evaluacion: inputs.partitions.filter(({ rol }) => rol === 'evaluacion').length,
    modelo_alcance_habilitado: options.alcanceHabilitado,
    supuesto_alcance: assumptionLabel(options),
    k_usado: options.k,
    tasa_base_por_arquetipo: archetypeRates,
    top_10_agentes: top10,
    desviacion_maxima_prior: Math.max(...priorDeviations),
    tasa_media: result.calibrations.reduce((sum, row) => sum + row.tasa_calibrada, 0) / result.calibrations.length,
    tasas_fuera_de_rango: result.calibrations.filter(({ tasa_calibrada: rate }) => rate < 0 || rate > 1).length,
  };
}

async function execute(supabase, options) {
  const inputs = await loadInputs(supabase, options.esquema);
  const result = buildCalibration(inputs.agents, inputs.posts, inputs.reactions, options);
  const id = await persistRun(supabase, options, result);
  return summarize(inputs, options, result, id);
}

async function main() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en backend/.env.');
  const options = parseOptions(process.argv.slice(2), process.env);
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const report = await execute(supabase, options);
  console.info(JSON.stringify(report, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  parseOptions,
  assumptionLabel,
  runId,
  calculatePostExposure,
  buildCalibration,
  loadInputs,
  execute,
};
