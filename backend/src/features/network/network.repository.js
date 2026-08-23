const { getSupabaseClient } = require('../../config/supabase');

/**
 * Escribe en las tablas que ya existen — `conexiones` y `posts` — en vez de
 * crear un esquema paralelo. La extracción es una fuente más de los mismos
 * datos que hoy se cargan a mano.
 */

const CHUNK = 500;

/** Supabase corta los payloads grandes; se insertan de a tandas. */
async function upsertInChunks(client, table, rows, onConflict, { select } = {}) {
  let written = 0;
  const selected = [];

  for (let i = 0; i < rows.length; i += CHUNK) {
    let query = client
      .from(table)
      .upsert(rows.slice(i, i + CHUNK), { onConflict, count: 'exact', ignoreDuplicates: false });
    if (select) query = query.select(select);
    const { data, error, count } = await query;
    if (error) throw error;
    written += count ?? rows.slice(i, i + CHUNK).length;
    if (data) selected.push(...data);
  }

  return { written, selected };
}

function normalizeConnectionUrl(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    const slug = url.pathname.match(/^\/in\/([^/]+)/i)?.[1];
    if (slug) return `linkedin.com/in/${decodeURIComponent(slug).toLowerCase()}`;
    url.search = '';
    url.hash = '';
    return `${url.hostname.toLowerCase()}${url.pathname.replace(/\/$/, '')}`;
  } catch {
    return value.toLowerCase().replace(/[?#].*$/, '').replace(/\/$/, '');
  }
}

function naturalKey({ nombre, name, fecha_contacto: fechaContacto, connectedOn }) {
  return `${String(nombre ?? name ?? '').trim().toLowerCase()}::${fechaContacto ?? connectedOn ?? ''}`;
}

/**
 * Guarda contactos bajo su dueño.
 *
 * La clave natural es (perfil, nombre, fecha_contacto): sin el perfil, dos
 * usuarios con un contacto homónimo se pisan entre sí. Sin fecha se inserta igual: perder un contacto
 * por no tener fecha sería peor que tener un duplicado.
 */
async function saveConnections(perfilUrl, contacts) {
  const client = getSupabaseClient();
  const prepared = contacts
    .filter((c) => c.name)
    .map((contact) => ({
      contact,
      row: {
        perfil_url: perfilUrl,
        linkedin_url: normalizeConnectionUrl(contact.url),
        nombre: contact.name,
        headline: contact.headline || null,
        fecha_contacto: contact.connectedOn || null,
        // Sin grado declarado se guarda NULL, no 1: "no sabemos" y "te ve
        // publicar" son cosas distintas y el panel las trata distinto.
        grado: contact.grado === 1 || contact.grado === 2 ? contact.grado : null,
      },
    }));

  if (prepared.length === 0) return { written: 0, matches: [] };

  const { data: existing, error: existingError } = await client
    .from('conexiones')
    .select('id,nombre,fecha_contacto,linkedin_url')
    .eq('perfil_url', perfilUrl);
  if (existingError) throw existingError;

  const byUrl = new Map(
    (existing ?? []).filter((row) => row.linkedin_url).map((row) => [row.linkedin_url, row]),
  );
  const byNatural = new Map();
  for (const row of existing ?? []) {
    const key = naturalKey(row);
    const rows = byNatural.get(key) ?? [];
    rows.push(row);
    byNatural.set(key, rows);
  }

  const updates = [];
  const insertsWithUrl = [];
  const insertsWithoutUrl = [];
  const seen = new Set();
  for (const { row } of prepared) {
    const sourceKey = row.linkedin_url ? `url:${row.linkedin_url}` : `natural:${naturalKey(row)}`;
    if (seen.has(sourceKey)) continue;
    seen.add(sourceKey);

    const urlMatch = row.linkedin_url ? byUrl.get(row.linkedin_url) : null;
    const naturalMatches = byNatural.get(naturalKey(row)) ?? [];
    const existingRow = urlMatch ?? (naturalMatches.length === 1 ? naturalMatches[0] : null);
    if (existingRow) updates.push({ id: existingRow.id, ...row });
    else if (row.linkedin_url) insertsWithUrl.push(row);
    else insertsWithoutUrl.push(row);
  }

  const results = await Promise.all([
    updates.length
      ? upsertInChunks(client, 'conexiones', updates, 'id')
      : { written: 0 },
    insertsWithUrl.length
      ? upsertInChunks(client, 'conexiones', insertsWithUrl, 'perfil_url,linkedin_url')
      : { written: 0 },
    insertsWithoutUrl.length
      ? upsertInChunks(client, 'conexiones', insertsWithoutUrl, 'perfil_url,nombre,fecha_contacto')
      : { written: 0 },
  ]);

  const { data: stored, error: storedError } = await client
    .from('conexiones')
    .select('id,nombre,fecha_contacto,linkedin_url')
    .eq('perfil_url', perfilUrl);
  if (storedError) throw storedError;

  const storedByUrl = new Map(
    (stored ?? []).filter((row) => row.linkedin_url).map((row) => [row.linkedin_url, row]),
  );
  const storedByNatural = new Map();
  for (const row of stored ?? []) {
    const key = naturalKey(row);
    const rows = storedByNatural.get(key) ?? [];
    rows.push(row);
    storedByNatural.set(key, rows);
  }

  const matches = prepared.flatMap(({ contact, row }) => {
    const urlMatch = row.linkedin_url ? storedByUrl.get(row.linkedin_url) : null;
    const naturalMatches = storedByNatural.get(naturalKey(row)) ?? [];
    const match = urlMatch ?? (naturalMatches.length === 1 ? naturalMatches[0] : null);
    return match ? [{ connectionId: String(match.id), contact }] : [];
  });

  return {
    written: results.reduce((total, result) => total + result.written, 0),
    matches,
  };
}

/**
 * Guarda publicaciones.
 *
 * `orden` y `orden_cronologico` son únicos por perfil, así que se calculan a
 * partir de lo que ya hay de ESE perfil: la extracción agrega al final en vez de pisar lo
 * que se cargó a mano.
 */
async function savePosts(perfilUrl, posts) {
  if (posts.length === 0) return 0;

  const client = getSupabaseClient();
  const { data: existing, error } = await client
    .from('posts')
    .select('orden')
    .eq('perfil_url', perfilUrl)
    .order('orden', { ascending: false })
    .limit(1);
  if (error) throw error;

  const offset = existing?.[0]?.orden ?? 0;

  const rows = posts
    .filter((p) => p.text)
    .map((p, i) => ({
      perfil_url: perfilUrl,
      texto: p.text,
      fecha: p.date || null,
      impresiones: p.impressions,
      total_reacciones: p.reactions,
      compartidos: p.shares,
      // harvestapi no trae "interacciones sociales" de analytics. Acá vive el
      // conteo público de comentarios: el promedio de comentarios sale de acá,
      // no de un campo plano que harvest deja en null.
      interacciones_sociales: p.comments,
      orden: offset + i + 1,
      orden_cronologico: offset + i + 1,
    }));

  if (rows.length === 0) return 0;
  return (await upsertInChunks(client, 'posts', rows, 'perfil_url,orden')).written;
}

function claveTexto(texto) {
  return String(texto ?? '').replace(/\s+/g, ' ').trim().slice(0, 80).toLowerCase();
}

/**
 * Quién reaccionó a qué post, para que el panel no reciba solo un conteo.
 *
 * El actor deja el historial en cada contacto (post, fecha, tipo, subtipo).
 * Acá se cruza con las filas de `posts` y `conexiones` ya persistidas. Sin
 * este paso la ficha del agente dice "reaccionaste N veces" y no puede decir
 * a cuál ni con qué gesto.
 */
async function saveReactions(perfilUrl, { matches }) {
  const eventos = (matches ?? []).flatMap(({ connectionId, contact }) =>
    (contact?.historial ?? []).map((evento) => ({ connectionId, contact, evento })),
  );
  if (eventos.length === 0) return 0;

  const client = getSupabaseClient();
  const { data: storedPosts, error } = await client
    .from('posts')
    .select('id,texto')
    .eq('perfil_url', perfilUrl);
  if (error) throw error;

  const rows = [];
  const seen = new Set();
  for (const { connectionId, contact, evento } of eventos) {
    const post = matchPost(evento, storedPosts ?? []);
    if (!post) continue;
    // Los tres gestos, no dos. Colapsar el compartido en un like hacía que la
    // mezcla observada no tuviera nunca compartidos, y el repost —el único gesto
    // que le muestra tu post a gente con la que no estás conectado— desaparecía
    // del dato justo donde más falta hace.
    const tipo = evento.tipo === 'comentario' ? 'comentario'
      : evento.tipo === 'compartir' ? 'compartir'
      : 'like';
    const nombre = contact.name;
    const clave = `${post.id}:${nombre}:${tipo}`;
    if (seen.has(clave)) continue;
    seen.add(clave);
    rows.push({
      post_id: post.id,
      conexion_id: Number(connectionId),
      nombre,
      headline: contact.headline || null,
      tipo,
      subtipo: tipo === 'like' ? (evento.subtipo || 'like') : null,
      grado: contact.grado === 1 || contact.grado === 2 ? contact.grado : null,
      texto_comentario: evento.comentario || null,
      en_conexiones: true,
    });
  }

  if (rows.length === 0) return 0;
  return (await upsertInChunks(client, 'reacciones', rows, 'post_id,nombre,tipo')).written;
}

function matchPost(evento, storedPosts) {
  const hook = claveTexto(evento.hook);
  if (!hook) return null;
  return storedPosts.find((post) => {
    const texto = claveTexto(post.texto);
    return texto === hook || texto.startsWith(hook) || hook.startsWith(texto.slice(0, 40));
  }) ?? null;
}

module.exports = {
  saveConnections,
  savePosts,
  saveReactions,
  normalizeConnectionUrl,
  naturalKey,
  matchPost,
};
