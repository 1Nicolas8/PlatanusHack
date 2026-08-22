const { getSupabaseClient } = require('../../config/supabase');

/** Única capa que conoce Supabase para el mapa de la red. */

async function loadConnections() {
  const { data, error } = await getSupabaseClient()
    .from('conexiones')
    .select('id, nombre, headline, fecha_contacto, arquetipo_id');
  if (error) throw error;

  return (data ?? []).map((c) => ({
    id: c.id,
    nombre: c.nombre,
    headline: c.headline ?? '',
    fechaContacto: c.fecha_contacto,
    arquetipoId: c.arquetipo_id,
  }));
}

async function loadReactions() {
  const { data, error } = await getSupabaseClient()
    .from('reacciones')
    .select('conexion_id, post_id, tipo');
  if (error) throw error;

  return (data ?? []).map((r) => ({ conexionId: r.conexion_id, postId: r.post_id, tipo: r.tipo }));
}

async function loadPosts() {
  const { data, error } = await getSupabaseClient()
    .from('posts')
    .select('id, orden_cronologico, fecha, texto');
  if (error) throw error;

  return (data ?? []).map((p) => ({
    id: p.id,
    ordenCronologico: p.orden_cronologico,
    fecha: p.fecha,
    texto: p.texto,
  }));
}

module.exports = { loadConnections, loadReactions, loadPosts };
