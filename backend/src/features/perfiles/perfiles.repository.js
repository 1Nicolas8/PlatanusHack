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

/** Guarda la corrida y deja sus perfiles como snapshot consultable. */
async function saveActorAudience({ perfilUrl, runId, startedAt, finishedAt, contactsTotal, ownerFotoUrl, rows }) {
  const client = getSupabaseClient();
  const { error } = await client.from('audiencias_actor').upsert({
    run_id: runId,
    perfil_url: perfilUrl,
    total_contactos: contactsTotal,
    iniciada_en: startedAt,
    terminada_en: finishedAt ?? null,
    ...(ownerFotoUrl ? { foto_url: ownerFotoUrl } : {}),
  }, { onConflict: 'run_id' });
  if (error) throw error;

  return saveProfiles(rows);
}

async function findActiveAudience(perfilUrl) {
  const { data, error } = await getSupabaseClient()
    .from('audiencias_actor')
    .select('run_id,perfil_url,total_contactos,iniciada_en,terminada_en,created_at')
    .eq('perfil_url', perfilUrl)
    .order('iniciada_en', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

/** Qué contactos de un perfil ya están enriquecidos y cuáles no. */
async function coverage(perfilUrl) {
  const client = getSupabaseClient();
  const audience = await findActiveAudience(perfilUrl);

  const { count: total, error: errorTotal } = await client
    .from('conexiones')
    .select('id', { count: 'exact', head: true })
    .eq('perfil_url', perfilUrl);
  if (errorTotal) throw errorTotal;

  if (!audience) {
    return {
      conexiones: total ?? 0,
      enriquecidas: 0,
      candidatos: 0,
      audienciaActiva: null,
      ultimoEnriquecimiento: null,
    };
  }

  const { data: enriquecidos, error: errorEnriquecidos } = await client
    .from('perfiles_enriquecidos')
    .select('conexion_id, extraido_en, conexiones!inner(perfil_url)')
    .eq('actor_run_id', audience.run_id)
    .eq('conexiones.perfil_url', perfilUrl);
  if (errorEnriquecidos) throw errorEnriquecidos;

  return {
    conexiones: total ?? 0,
    enriquecidas: enriquecidos?.length ?? 0,
    candidatos: Math.min(enriquecidos?.length ?? 0, 200),
    audienciaActiva: {
      runId: audience.run_id,
      totalContactos: audience.total_contactos,
      iniciadaEn: audience.iniciada_en,
      terminadaEn: audience.terminada_en,
    },
    ultimoEnriquecimiento:
      enriquecidos?.map((e) => e.extraido_en).sort().at(-1) ?? null,
  };
}

module.exports = {
  loadConnectionIndex,
  saveProfiles,
  saveActorAudience,
  findActiveAudience,
  coverage,
};
