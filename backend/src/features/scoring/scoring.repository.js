const { getSupabaseClient } = require('../../config/supabase');

/**
 * Lee la audiencia calibrada que dejó el pipeline de arquetipos y calibración.
 * Es la única capa que conoce Supabase.
 */

async function loadArchetypes() {
  const { data, error } = await getSupabaseClient()
    .from('arquetipos')
    .select('id, nombre, awareness');
  if (error) throw error;

  return (data ?? []).map((a) => ({ id: String(a.id), label: a.nombre, awareness: a.awareness }));
}

/**
 * Un agente por conexión real, con su tasa calibrada sobre el historial.
 *
 * Puede haber más de una corrida de calibración; se toma la primera tasa por
 * agente. Promediar corridas con supuestos distintos mezclaría modelos.
 */
async function loadAgents() {
  const { data, error } = await getSupabaseClient()
    .from('agentes_simulacion')
    .select('id, arquetipo_id, calibraciones_agentes(tasa_calibrada)')
    .not('arquetipo_id', 'is', null);
  if (error) throw error;

  return (data ?? []).map((a) => ({
    id: String(a.id),
    archetypeId: String(a.arquetipo_id),
    tasaCalibrada: Number(a.calibraciones_agentes?.[0]?.tasa_calibrada ?? 0),
  }));
}

module.exports = { loadArchetypes, loadAgents };
