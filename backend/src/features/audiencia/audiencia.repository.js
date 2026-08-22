const { getSupabaseClient } = require('../../config/supabase');

async function select(query, label) {
  const { data, error } = await query;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

/**
 * Trae crudo de Supabase todo lo que warmth.service necesita para calcular
 * temperatura: conexiones, sus arquetipos, los posts (para recencia) y las
 * reacciones (para el score). Sin corridaId ni calibración: esto solo lee lo
 * que ya está cargado en la red del usuario.
 */
async function loadAudienceData({ supabase = getSupabaseClient() } = {}) {
  const [connections, archetypes, posts, reactions] = await Promise.all([
    select(
      supabase.from('conexiones').select('id,nombre,headline,fecha_contacto,arquetipo_id').order('id'),
      'No se pudieron leer las conexiones',
    ),
    select(
      supabase.from('arquetipos').select('id,nombre').order('id'),
      'No se pudieron leer los arquetipos',
    ),
    select(
      supabase.from('posts').select('id,orden_cronologico,fecha').order('orden_cronologico'),
      'No se pudieron leer los posts',
    ),
    select(
      supabase
        .from('reacciones')
        .select('conexion_id,post_id,tipo,texto_comentario')
        .not('conexion_id', 'is', null),
      'No se pudieron leer las reacciones',
    ),
  ]);

  return {
    connections: connections.map((c) => ({
      id: String(c.id),
      nombre: c.nombre,
      headline: c.headline,
      fechaContacto: c.fecha_contacto,
      arquetipoId: c.arquetipo_id === null ? null : String(c.arquetipo_id),
    })),
    archetypes: archetypes.map((a) => ({ id: String(a.id), nombre: a.nombre })),
    posts: posts.map((p) => ({
      id: String(p.id),
      ordenCronologico: p.orden_cronologico,
      fecha: p.fecha,
    })),
    reactions: reactions.map((r) => ({
      conexionId: r.conexion_id === null ? null : String(r.conexion_id),
      postId: String(r.post_id),
      tipo: r.tipo,
      textoComentario: r.texto_comentario,
    })),
  };
}

module.exports = { loadAudienceData };
