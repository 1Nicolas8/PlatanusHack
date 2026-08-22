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
      orden: offset + i + 1,
      orden_cronologico: offset + i + 1,
    }));

  if (rows.length === 0) return 0;
  return (await upsertInChunks(client, 'posts', rows, 'perfil_url,orden')).written;
}

module.exports = { saveConnections, savePosts, normalizeConnectionUrl, naturalKey };
