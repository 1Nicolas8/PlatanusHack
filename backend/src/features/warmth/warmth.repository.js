const { getSupabaseClient } = require('../../config/supabase');

/** Única capa que conoce Supabase para el mapa de la red. */

/**
 * Todo se filtra por perfil. Sin filtro el producto muestra la red de otra
 * persona como si fuera la tuya, que es peor que no mostrar nada.
 */
async function loadConnections(perfilUrl) {
  const { data, error } = await getSupabaseClient()
    .from('conexiones')
    .select('id, nombre, headline, fecha_contacto, arquetipo_id')
    .eq('perfil_url', perfilUrl);
  if (error) throw error;

  return (data ?? []).map((c) => ({
    id: c.id,
    nombre: c.nombre,
    headline: c.headline ?? '',
    fechaContacto: c.fecha_contacto,
    arquetipoId: c.arquetipo_id,
  }));
}

async function loadReactions(perfilUrl) {
  const { data, error } = await getSupabaseClient()
    .from('reacciones')
    .select('conexion_id, post_id, tipo, posts!inner(perfil_url)')
    .eq('posts.perfil_url', perfilUrl);
  if (error) throw error;

  return (data ?? []).map((r) => ({ conexionId: r.conexion_id, postId: r.post_id, tipo: r.tipo }));
}

async function loadPosts(perfilUrl) {
  const { data, error } = await getSupabaseClient()
    .from('posts')
    .select('id, orden_cronologico, fecha, texto')
    .eq('perfil_url', perfilUrl);
  if (error) throw error;

  return (data ?? []).map((p) => ({
    id: p.id,
    ordenCronologico: p.orden_cronologico,
    fecha: p.fecha,
    texto: p.texto,
  }));
}

module.exports = { loadConnections, loadReactions, loadPosts };
