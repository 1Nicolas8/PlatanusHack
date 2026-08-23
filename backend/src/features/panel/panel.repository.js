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
/**
 * El scraper no usa un vocabulario único para el tipo de reacción — conviven
 * `comment`/`comentario` y `share`/`compartido` — así que se normaliza acá, en
 * el borde, y el resto del feature ve las tres acciones del panel.
 */
function normalizarTipo(tipo, textoComentario) {
  const valor = String(tipo ?? '').toLowerCase();
  if (valor.includes('coment') || valor.includes('comment') || textoComentario) return 'comentar';
  if (valor.includes('compart') || valor.includes('share') || valor.includes('repost')) return 'compartir';
  return 'like';
}

async function loadPanelCandidates(perfilUrl) {
  const client = getSupabaseClient();
  const { data: audience, error: audienceError } = await client
    .from('audiencias_actor')
    .select('run_id')
    .eq('perfil_url', perfilUrl)
    .order('iniciada_en', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (audienceError) throw audienceError;

  let connectionsQuery = client
    .from('conexiones')
    .select(
      'id, nombre, headline, fecha_contacto, grado, ' +
        `perfiles_enriquecidos${audience ? '!inner' : ''}(actor_run_id, descripcion, cargo_actual, empresa_actual, sector, ubicacion, ` +
        'experiencia, educacion, publicaciones, en_comun, seguidores, conexiones, foto_url, linkedin_url, ' +
        'grado_grafo, es_icp, confianza_icp, razon_icp)',
    )
    .eq('perfil_url', perfilUrl);
  if (audience) {
    connectionsQuery = connectionsQuery.eq('perfiles_enriquecidos.actor_run_id', audience.run_id);
  }
  const { data: conexiones, error: errorConexiones } = await connectionsQuery;
  if (errorConexiones) throw errorConexiones;
  if (!conexiones?.length) return [];

  const { data: reacciones, error: errorReacciones } = await client
    .from('reacciones')
    .select('conexion_id, tipo, subtipo, texto_comentario, posts!inner(id, perfil_url, texto, fecha, orden_cronologico)')
    .eq('posts.perfil_url', perfilUrl)
    .not('conexion_id', 'is', null);
  if (errorReacciones) throw errorReacciones;

  const historial = new Map();
  for (const reaccion of reacciones ?? []) {
    const clave = String(reaccion.conexion_id);
    const actual = historial.get(clave) ?? {
      interacciones: 0,
      comentarios: [],
      porTipo: {},
      eventos: [],
    };
    actual.interacciones += 1;
    // Cómo reaccionó cada uno, no solo cuántas veces: es el único dato
    // observado que dice si esta red comenta o solo pone like.
    const tipo = normalizarTipo(reaccion.tipo, reaccion.texto_comentario);
    actual.porTipo[tipo] = (actual.porTipo[tipo] ?? 0) + 1;
    if (reaccion.texto_comentario) actual.comentarios.push(reaccion.texto_comentario);
    actual.eventos.push({
      tipo,
      subtipo: reaccion.subtipo ?? null,
      // El post al que reaccionó, no solo el gancho: sin esto no se puede saber
      // a cuáles NO reaccionó, que es la mitad de la historia que faltaba.
      postId: reaccion.posts?.id === undefined ? null : String(reaccion.posts.id),
      orden: reaccion.posts?.orden_cronologico ?? null,
      fecha: reaccion.posts?.fecha ?? null,
      hook: String(reaccion.posts?.texto ?? '').replace(/\s+/g, ' ').trim().slice(0, 140),
      comentario: reaccion.texto_comentario ?? null,
    });
    historial.set(clave, actual);
  }

  return conexiones.map((conexion) => {
    const enriquecido = conexion.perfiles_enriquecidos;
    const perfil = Array.isArray(enriquecido) ? enriquecido[0] : enriquecido;
    const suHistorial = historial.get(String(conexion.id)) ?? {
      interacciones: 0,
      comentarios: [],
      porTipo: {},
      eventos: [],
    };

    return {
      id: String(conexion.id),
      nombre: conexion.nombre,
      headline: conexion.headline,
      fechaContacto: conexion.fecha_contacto,
      // Sin grado cargado se asume primer grado: la red actual se armó desde
      // quienes ya reaccionaron a algo tuyo, y esa gente sí te ve.
      grado: conexion.grado === null || conexion.grado === undefined ? 1 : Number(conexion.grado),
      interacciones: suHistorial.interacciones,
      reaccionesPorTipo: suHistorial.porTipo,
      comentariosPrevios: suHistorial.comentarios,
      historialObservado: suHistorial.eventos,
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
            conexiones: perfil.conexiones,
            fotoUrl: perfil.foto_url,
            linkedinUrl: perfil.linkedin_url,
            gradoGrafo: perfil.grado_grafo,
            esIcp: perfil.es_icp,
            confianzaIcp:
              perfil.confianza_icp === null || perfil.confianza_icp === undefined
                ? null
                : Number(perfil.confianza_icp),
            razonIcp: perfil.razon_icp,
          }
        : null,
    };
  });
}

/**
 * Las publicaciones del perfil, con sus métricas reales.
 *
 * Son dos cosas a la vez y las dos faltaban: el ancla contra la que se compara
 * lo que el panel proyecta —un post que junta nueve reacciones no puede
 * proyectar cuarenta— y la evidencia negativa de cada agente, que es a cuáles
 * de estos posts NO reaccionó.
 */
async function loadProfilePosts(perfilUrl) {
  const { data, error } = await getSupabaseClient()
    .from('posts')
    .select('id, texto, fecha, orden_cronologico, impresiones, total_reacciones, compartidos, interacciones_sociales')
    .eq('perfil_url', perfilUrl)
    .order('orden_cronologico');
  if (error) throw error;

  return (data ?? []).map((post) => ({
    id: String(post.id),
    texto: post.texto,
    fecha: post.fecha,
    ordenCronologico: post.orden_cronologico,
    impresiones: post.impresiones,
    totalReacciones: post.total_reacciones,
    compartidos: post.compartidos,
    interaccionesSociales: post.interacciones_sociales,
  }));
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

module.exports = { loadPanelCandidates, loadProfilePosts, saveRun, findRun, listTurns, listRuns };
