const { getSupabaseClient } = require('../../config/supabase');

async function findLatestCalibrationRun({ supabase = getSupabaseClient() } = {}) {
  const { data, error } = await supabase
    .from('corridas_calibracion')
    .select('id')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`No se pudo leer la última corrida de calibración: ${error.message}`);

  return data ? { id: String(data.id) } : null;
}

module.exports = { findLatestCalibrationRun };
