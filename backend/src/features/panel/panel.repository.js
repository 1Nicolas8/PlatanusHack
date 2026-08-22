const { getSupabaseClient } = require('../../config/supabase');

/** Única capa que conoce Supabase para el panel. */

/** Supabase corta payloads grandes; los turnos se escriben de a tandas. */
const CHUNK = 200;

/**
 * Los candidatos a integrar el panel: la red del perfil, con lo que se sepa de
 * cada uno.
 *
 * El perfil enriquecido es opcional a propósito — enriquecer cuesta un scrape
 * por persona y solo se le hace a los que el plan selecciona. Un contacto sin
 * fila en `perfiles_enriquecidos` entra igual al panel, opinando desde su
 * headline, y el resultado marca cuáles eran cuáles.
 */
async function loadPanelCandidates(perfilUrl) {
  const client = getSupabaseClient();

  const { data: conexiones, error: errorConexiones } = await client
    .from('conexiones')
    .select(
      'id, nombre, headline, fecha_contacto, ' +
        'perfiles_enriquecidos(descripcion, cargo_actual, empresa_actual, sector, ubicacion, ' +
        'experiencia, educacion, publicaciones, en_comun, seguidores)',
    )
    .eq('perfil_url', perfilUrl);
  if (errorConexiones) throw errorConexiones;
  if (!conexiones?.length) return [];

  const { data: reacciones, error: errorReacciones } = await client
    .from('reacciones')
    .select('conexion_id, tipo, texto_comentario, posts!inner(perfil_url)')
    .eq('posts.perfil_url', perfilUrl)
    .not('conexion_id', 'is', null);
  if (errorReacciones) throw errorReacciones;

  const historial = new Map();
  for (const reaccion of reacciones ?? []) {
    const clave = String(reaccion.conexion_id);
    const actual = historial.get(clave) ?? { interacciones: 0, comentarios: [] };
    actual.interacciones += 1;
    if (reaccion.texto_comentario) actual.comentarios.push(reaccion.texto_comentario);
    historial.set(clave, actual);
  }

  return conexiones.map((conexion) => {
    const enriquecido = conexion.perfiles_enriquecidos;
    const perfil = Array.isArray(enriquecido) ? enriquecido[0] : enriquecido;
    const suHistorial = historial.get(String(conexion.id)) ?? { interacciones: 0, comentarios: [] };

    return {
      id: String(conexion.id),
      nombre: conexion.nombre,
      headline: conexion.headline,
      fechaContacto: conexion.fecha_contacto,
      interacciones: suHistorial.interacciones,
      comentariosPrevios: suHistorial.comentarios,
      perfil: perfil
        ? {
            descripcion: perfil.descripcion,
            cargoActual: perfil.cargo_actual,
            empresaActual: perfil.empresa_actual,
            sector: perfil.sector,
            ubicacion: perfil.ubicacion,
            experiencia: perfil.experiencia,
            educacion: perfil.educacion,
            publicaciones: perfil.publicaciones,
            enComun: perfil.en_comun,
            seguidores: perfil.seguidores,
          }
        : null,
    };
  });
}

/**
 * Guarda la corrida completa: cabecera y turno por turno.
 *
 * El prompt de cada turno se guarda entero. Ocupa, pero es lo único que
 * permite volver seis horas después y explicar por qué un agente dijo lo que
 * dijo — sin eso la trazabilidad es una lista de veredictos sin causa.
 */
async function saveRun({ corridaId, perfilUrl, copy, icp, resultado }) {
  const client = getSupabaseClient();

  const { error: errorCabecera } = await client.from('corridas_panel').insert({
    id: corridaId,
    perfil_url: perfilUrl,
    copy,
    icp: icp ?? null,
    panel: resultado.configuracion.panel,
    rondas: resultado.configuracion.rondas,
    iteraciones: resultado.configuracion.iteraciones,
    modelo: resultado.configuracion.modelo,
    semilla: resultado.configuracion.semilla,
    score: resultado.score,
    desviacion: resultado.dispersion,
    convergio: resultado.convergio,
    veredicto: resultado.veredicto,
    mejoras: resultado.mejoras,
    resumen: {
      banda: resultado.banda,
      porIteracion: resultado.porIteracion,
      deliberacion: resultado.deliberacion,
      panel: resultado.panel,
      objeciones: resultado.objeciones,
      cobertura: resultado.cobertura,
    },
  });
  if (errorCabecera) throw errorCabecera;

  const filas = resultado.turnos.map((turno) => ({
    corrida_panel_id: corridaId,
    iteracion: turno.iteracion,
    ronda: turno.ronda,
    conexion_id: turno.conexionId ? Number(turno.conexionId) : null,
    nombre: turno.nombre,
    headline: turno.headline ?? null,
    accion: turno.error ? 'error' : turno.accion,
    score: turno.error ? 0 : turno.score,
    objecion: turno.objecion ?? null,
    comentario: turno.comentario ?? null,
    razon: turno.error ? turno.error : turno.razon,
    vio: turno.vio ?? null,
    prompt: turno.prompt ?? '',
    respuesta: turno.error
      ? { error: turno.error }
      : { accion: turno.accion, score: turno.score, influenciadoPor: turno.influenciadoPor },
  }));

  for (let i = 0; i < filas.length; i += CHUNK) {
    const { error } = await client.from('turnos_panel').insert(filas.slice(i, i + CHUNK));
    if (error) throw error;
  }

  return filas.length;
}

/** La cabecera de una corrida, para poder releerla después. */
async function findRun(corridaId) {
  const { data, error } = await getSupabaseClient()
    .from('corridas_panel')
    .select('*')
    .eq('id', corridaId)
    .maybeSingle();
  if (error) throw error;

  return data ?? null;
}

/** Los turnos de una corrida, en el orden en que ocurrieron. */
async function listTurns(corridaId) {
  const { data, error } = await getSupabaseClient()
    .from('turnos_panel')
    .select('*')
    .eq('corrida_panel_id', corridaId)
    .order('iteracion')
    .order('ronda')
    .order('id');
  if (error) throw error;

  return data ?? [];
}

/** Las últimas corridas de un perfil, sin los turnos: para un historial. */
async function listRuns({ perfilUrl, limit = 20 }) {
  const { data, error } = await getSupabaseClient()
    .from('corridas_panel')
    .select('id, copy, score, desviacion, convergio, veredicto, panel, rondas, iteraciones, created_at')
    .eq('perfil_url', perfilUrl)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;

  return data ?? [];
}

module.exports = { loadPanelCandidates, saveRun, findRun, listTurns, listRuns };
