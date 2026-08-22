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

async function listArchetypes({ supabase = getSupabaseClient() } = {}) {
  const { data, error } = await supabase
    .from('arquetipos')
    .select('id,nombre,descripcion,awareness,objeciones,pain_points,sensibilidad_precio,intencion_compra')
    .order('id');

  if (error) throw new Error(`No se pudieron leer los arquetipos: ${error.message}`);

  return data.map((archetype) => ({
    id: String(archetype.id),
    nombre: archetype.nombre,
    descripcion: archetype.descripcion,
    awareness: archetype.awareness,
    objeciones: archetype.objeciones,
    painPoints: archetype.pain_points,
    sensibilidadPrecio: archetype.sensibilidad_precio,
    intencionCompra: archetype.intencion_compra,
  }));
}

async function listConnections({ supabase = getSupabaseClient() } = {}) {
  const { data, error } = await supabase
    .from('conexiones')
    .select('id,nombre,headline')
    .order('id');

  if (error) throw new Error(`No se pudieron leer las conexiones: ${error.message}`);

  return data.map((connection) => ({
    id: String(connection.id),
    nombre: connection.nombre,
    headline: connection.headline,
  }));
}

async function loadReactionHistory({ connectionIds, supabase = getSupabaseClient() } = {}) {
  if (!connectionIds?.length) return new Map();

  const [{ data: reactions, error: reactionsError }, { data: posts, error: postsError }] = await Promise.all([
    supabase
      .from('reacciones')
      .select('conexion_id,post_id,tipo,texto_comentario')
      .in('conexion_id', connectionIds),
    supabase
      .from('posts')
      .select('id,titulo,texto'),
  ]);
  if (reactionsError) throw new Error(`No se pudo leer el historial de reacciones: ${reactionsError.message}`);
  if (postsError) throw new Error(`No se pudieron leer los posts del historial de reacciones: ${postsError.message}`);

  const postById = new Map(posts.map((post) => [String(post.id), post]));
  const historyByConnectionId = new Map(connectionIds.map((connectionId) => [String(connectionId), []]));
  for (const reaction of reactions) {
    const connectionId = String(reaction.conexion_id);
    const post = postById.get(String(reaction.post_id));
    historyByConnectionId.get(connectionId)?.push({
      postId: String(reaction.post_id),
      postTitulo: post?.titulo || post?.texto || 'Publicación sin título',
      tipo: reaction.tipo,
      textoComentario: reaction.texto_comentario,
    });
  }

  return historyByConnectionId;
}

module.exports = { findLatestCalibrationRun, listArchetypes, listConnections, loadReactionHistory };
