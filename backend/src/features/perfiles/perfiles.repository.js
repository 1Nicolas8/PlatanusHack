const { getSupabaseClient } = require('../../config/supabase');

/** Única capa que conoce Supabase para el enriquecimiento de perfiles. */

const CHUNK = 200;

/** Las conexiones de un perfil, indexadas por nombre para poder resolverlas. */
async function loadConnectionIndex(perfilUrl) {
  const { data, error } = await getSupabaseClient()
    .from('conexiones')
    .select('id, nombre')
    .eq('perfil_url', perfilUrl);
  if (error) throw error;

  return (data ?? []).map((c) => ({ id: String(c.id), nombre: c.nombre }));
}

/**
 * Escribe los perfiles enriquecidos.
 *
 * Upsert por `conexion_id`: volver a scrapear a alguien pisa lo viejo en vez
 * de duplicarlo. Un perfil cambia — la gente cambia de trabajo — y la versión
 * vigente es la que vale.
 */
async function saveProfiles(rows) {
  if (rows.length === 0) return 0;

  const client = getSupabaseClient();
  let escritas = 0;

  for (let i = 0; i < rows.length; i += CHUNK) {
    const tanda = rows.slice(i, i + CHUNK);
    const { error, count } = await client
      .from('perfiles_enriquecidos')
      .upsert(tanda, { onConflict: 'conexion_id', count: 'exact' });
    if (error) throw error;
    escritas += count ?? tanda.length;
  }

  return escritas;
}

/** Qué contactos de un perfil ya están enriquecidos y cuáles no. */
async function coverage(perfilUrl) {
  const client = getSupabaseClient();

  const [{ count: total, error: errorTotal }, { data: enriquecidos, error: errorEnriquecidos }] =
    await Promise.all([
      client.from('conexiones').select('id', { count: 'exact', head: true }).eq('perfil_url', perfilUrl),
      client
        .from('perfiles_enriquecidos')
        .select('conexion_id, extraido_en, conexiones!inner(perfil_url)')
        .eq('conexiones.perfil_url', perfilUrl),
    ]);
  if (errorTotal) throw errorTotal;
  if (errorEnriquecidos) throw errorEnriquecidos;

  return {
    conexiones: total ?? 0,
    enriquecidas: enriquecidos?.length ?? 0,
    ultimoEnriquecimiento:
      enriquecidos?.map((e) => e.extraido_en).sort().at(-1) ?? null,
  };
}

module.exports = { loadConnectionIndex, saveProfiles, coverage };
