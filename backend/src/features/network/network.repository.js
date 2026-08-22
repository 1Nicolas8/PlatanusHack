const { getSupabaseClient } = require('../../config/supabase');

/**
 * Escribe en las tablas que ya existen — `conexiones` y `posts` — en vez de
 * crear un esquema paralelo. La extracción es una fuente más de los mismos
 * datos que hoy se cargan a mano.
 */

const CHUNK = 500;

/** Supabase corta los payloads grandes; se insertan de a tandas. */
async function upsertInChunks(table, rows, onConflict) {
  const client = getSupabaseClient();
  let written = 0;

  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error, count } = await client
      .from(table)
      .upsert(rows.slice(i, i + CHUNK), { onConflict, count: 'exact', ignoreDuplicates: false });
    if (error) throw error;
    written += count ?? rows.slice(i, i + CHUNK).length;
  }

  return written;
}

/**
 * Guarda contactos.
 *
 * La clave natural es (nombre, fecha_contacto), que es lo único estable que
 * trae el export de LinkedIn. Sin fecha se inserta igual: perder un contacto
 * por no tener fecha sería peor que tener un duplicado.
 */
async function saveConnections(contacts) {
  const rows = contacts
    .filter((c) => c.name)
    .map((c) => ({
      nombre: c.name,
      headline: c.headline || null,
      fecha_contacto: c.connectedOn || null,
    }));

  if (rows.length === 0) return 0;
  return upsertInChunks('conexiones', rows, 'nombre,fecha_contacto');
}

/**
 * Guarda publicaciones.
 *
 * `orden` y `orden_cronologico` son únicos en el esquema, así que se calculan a
 * partir de lo que ya hay: la extracción agrega al final en vez de pisar lo
 * que se cargó a mano.
 */
async function savePosts(posts) {
  if (posts.length === 0) return 0;

  const client = getSupabaseClient();
  const { data: existing, error } = await client
    .from('posts')
    .select('orden')
    .order('orden', { ascending: false })
    .limit(1);
  if (error) throw error;

  const offset = existing?.[0]?.orden ?? 0;

  const rows = posts
    .filter((p) => p.text)
    .map((p, i) => ({
      texto: p.text,
      fecha: p.date || null,
      impresiones: p.impressions,
      total_reacciones: p.reactions,
      compartidos: p.shares,
      orden: offset + i + 1,
      orden_cronologico: offset + i + 1,
    }));

  if (rows.length === 0) return 0;
  return upsertInChunks('posts', rows, 'orden');
}

module.exports = { saveConnections, savePosts };
