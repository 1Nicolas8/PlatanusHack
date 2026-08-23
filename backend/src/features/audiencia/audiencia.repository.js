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
function fotoDePerfil(enriquecido) {
  const perfil = Array.isArray(enriquecido) ? enriquecido[0] : enriquecido;
  return perfil?.foto_url ?? null;
}

async function loadAudienceData({ perfilUrl, supabase = getSupabaseClient() } = {}) {
  const [connections, archetypes, posts, reactions, audience] = await Promise.all([
    select(
      supabase
        .from('conexiones')
        .select('id,nombre,headline,fecha_contacto,arquetipo_id,perfiles_enriquecidos(foto_url)')
        .eq('perfil_url', perfilUrl)
        .order('id'),
      'No se pudieron leer las conexiones',
    ),
    select(
      supabase.from('arquetipos').select('id,nombre').order('id'),
      'No se pudieron leer los arquetipos',
    ),
    select(
      supabase
        .from('posts')
        .select('id,orden_cronologico,fecha,total_reacciones,interacciones_sociales')
        .eq('perfil_url', perfilUrl)
        .order('orden_cronologico'),
      'No se pudieron leer los posts',
    ),
    select(
      supabase
        .from('reacciones')
        .select('conexion_id,post_id,tipo,texto_comentario,posts!inner(perfil_url)')
        .eq('posts.perfil_url', perfilUrl)
        .not('conexion_id', 'is', null),
      'No se pudieron leer las reacciones',
    ),
    supabase
      .from('audiencias_actor')
      .select('foto_url')
      .eq('perfil_url', perfilUrl)
      .order('iniciada_en', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        // La columna es nueva: si la migración no corrió, la red igual se arma.
        if (error) return null;
        return data?.foto_url ?? null;
      }),
  ]);

  return {
    ownerFotoUrl: audience,
    connections: connections.map((c) => ({
      id: String(c.id),
      nombre: c.nombre,
      headline: c.headline,
      fechaContacto: c.fecha_contacto,
      arquetipoId: c.arquetipo_id === null ? null : String(c.arquetipo_id),
      fotoUrl: fotoDePerfil(c.perfiles_enriquecidos),
    })),
    archetypes: archetypes.map((a) => ({ id: String(a.id), nombre: a.nombre })),
    posts: posts.map((p) => ({
      id: String(p.id),
      ordenCronologico: p.orden_cronologico,
      fecha: p.fecha,
      reacciones: p.total_reacciones,
      comentarios: p.interacciones_sociales,
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
