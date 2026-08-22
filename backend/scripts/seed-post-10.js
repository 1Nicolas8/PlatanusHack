const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const TEXT_PATH = path.resolve(__dirname, '..', '..', 'data', 'post_10_texto.txt');
const REACTIONS_PATH = path.resolve(__dirname, '..', '..', 'data', 'post_10_elevenlabs.tsv');
const EXPECTED_REACTIONS = 16;
const EXPECTED_LEGACY_REACTIONS = 259;
const EXPECTED_METRICS = {
  impresiones: 602,
  alcanzados: 300,
  pct_en_red: 40,
  pct_fuera_red: 60,
  reacciones: 16,
  comentarios: 0,
  compartidos: 2,
  guardados: 0,
  interacciones_sociales: 18,
  visualizaciones_video: 203,
  visualizaciones_perfil: 9,
  seguidores_obtenidos: 0,
};

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseMetrics(lines) {
  const metadata = lines.filter((line) => line.startsWith('#')).join(' ');
  const metrics = {};
  for (const match of metadata.matchAll(/([a-z_]+)=(\d+)/g)) metrics[match[1]] = Number(match[2]);

  for (const [key, expected] of Object.entries(EXPECTED_METRICS)) {
    if (metrics[key] !== expected) {
      throw new Error(`Métrica ${key}: se obtuvo ${metrics[key]}, se esperaba ${expected}.`);
    }
  }
  return metrics;
}

function parseReactions(source) {
  const lines = source.split(/\r?\n/).filter(Boolean);
  const metrics = parseMetrics(lines);
  const reactions = lines.filter((line) => !line.startsWith('#')).map((line, index) => {
    const fields = line.split('\t');
    if (fields.length !== 4) throw new Error(`Fila de reactor ${index + 1}: se esperaban 4 campos, llegaron ${fields.length}.`);
    const [subtipo, nombre, rawGrado, headline] = fields.map((field) => field.trim());
    const grado = Number(rawGrado);
    if (!['like', 'love', 'celebrate'].includes(subtipo)) throw new Error(`Subtipo inválido para ${nombre}: ${subtipo}.`);
    if (![1, 2].includes(grado)) throw new Error(`Grado inválido para ${nombre}: ${rawGrado}.`);
    if (!nombre) throw new Error(`Fila de reactor ${index + 1}: nombre vacío.`);
    return { tipo: 'like', subtipo, nombre, grado, headline: headline || null, texto_comentario: null };
  });

  if (reactions.length !== EXPECTED_REACTIONS) {
    throw new Error(`Se encontraron ${reactions.length} reactores; se esperaban ${EXPECTED_REACTIONS}.`);
  }
  const keys = reactions.map((reaction) => normalize(reaction.nombre));
  const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);
  if (duplicates.length) throw new Error(`Hay reactores duplicados por nombre normalizado: ${[...new Set(duplicates)].join(', ')}.`);

  return { metrics, reactions };
}

function buildConnectionIndex(connections) {
  const exact = new Map();
  const normalized = new Map();
  for (const connection of connections) {
    for (const [index, key] of [[exact, connection.nombre], [normalized, normalize(connection.nombre)]]) {
      const matches = index.get(key) || [];
      matches.push(connection);
      index.set(key, matches);
    }
  }
  return { exact, normalized };
}

function matchConnection(name, index) {
  const exactMatches = index.exact.get(name) || [];
  if (exactMatches.length === 1) return { connection: exactMatches[0], method: 'exacto' };
  if (exactMatches.length > 1) return null;
  const normalizedMatches = index.normalized.get(normalize(name)) || [];
  if (normalizedMatches.length === 1) return { connection: normalizedMatches[0], method: 'normalizado' };
  return null;
}

function stableHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function selectAll(query, label) {
  const { data, error } = await query;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

async function snapshotPostsOneToNine(supabase) {
  const posts = await selectAll(
    supabase.from('posts').select('*').gte('orden', 1).lte('orden', 9).order('orden'),
    'No se pudieron leer posts 1..9',
  );
  const postIds = posts.map((post) => post.id);
  const reactions = await selectAll(
    supabase.from('reacciones').select('*').in('post_id', postIds).order('id'),
    'No se pudieron leer reacciones de posts 1..9',
  );
  return { posts, reactions, hash: stableHash({ posts, reactions }) };
}

function reactionBreakdown(reactions, field) {
  return reactions.reduce((counts, reaction) => ({ ...counts, [reaction[field]]: (counts[reaction[field]] || 0) + 1 }), {});
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const [textSource, reactionSource] = await Promise.all([
    fs.readFile(TEXT_PATH, 'utf8'),
    fs.readFile(REACTIONS_PATH, 'utf8'),
  ]);
  const texto = textSource.trim();
  const titulo = texto.split(/\r?\n/)[0].trim();
  const parsed = parseReactions(reactionSource);

  if (dryRun) {
    console.info(JSON.stringify({ titulo, metricas: parsed.metrics, reacciones: parsed.reactions }, null, 2));
    return;
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en backend/.env.');
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const allPostsBefore = await selectAll(supabase.from('posts').select('id,orden').order('orden'), 'No se pudieron leer posts');
  const allowedOrders = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const unexpectedOrders = allPostsBefore.filter((post) => !allowedOrders.has(post.orden));
  if (unexpectedOrders.length) throw new Error(`Hay posts fuera de orden 1..10: ${unexpectedOrders.map((post) => post.orden).join(', ')}.`);
  for (let order = 1; order <= 9; order += 1) {
    if (!allPostsBefore.some((post) => post.orden === order)) throw new Error(`Falta el post existente orden ${order}.`);
  }

  const legacyBefore = await snapshotPostsOneToNine(supabase);
  if (legacyBefore.posts.length !== 9 || legacyBefore.reactions.length !== EXPECTED_LEGACY_REACTIONS) {
    throw new Error(`Línea base inesperada: ${legacyBefore.posts.length} posts 1..9 y ${legacyBefore.reactions.length} reacciones; se esperaban 9 y ${EXPECTED_LEGACY_REACTIONS}.`);
  }

  const existingPost10 = allPostsBefore.find((post) => post.orden === 10);
  if (existingPost10) {
    const existingReactions = await selectAll(
      supabase.from('reacciones').select('nombre,tipo').eq('post_id', existingPost10.id),
      'No se pudieron prevalidar reacciones del post 10',
    );
    const sourceKeys = new Set(parsed.reactions.map((reaction) => `${normalize(reaction.nombre)}\u0000${reaction.tipo}`));
    const extras = existingReactions.filter((reaction) => !sourceKeys.has(`${normalize(reaction.nombre)}\u0000${reaction.tipo}`));
    if (extras.length) throw new Error(`El post 10 ya tiene ${extras.length} reacciones ajenas a la fuente: ${extras.map((row) => row.nombre).join(', ')}.`);
  }

  const connections = await selectAll(supabase.from('conexiones').select('id,nombre'), 'No se pudieron leer conexiones');
  const connectionIndex = buildConnectionIndex(connections);
  const matchedReactions = parsed.reactions.map((reaction) => {
    const match = matchConnection(reaction.nombre, connectionIndex);
    return {
      ...reaction,
      conexion_id: match ? match.connection.id : null,
      en_conexiones: Boolean(match),
      metodo_match: match ? match.method : null,
    };
  });

  const postRow = {
    orden: 10,
    titulo,
    texto,
    fecha: null,
    tipo: 'publicacion',
    impresiones: parsed.metrics.impresiones,
    total_reacciones: parsed.metrics.reacciones,
    alcanzados: parsed.metrics.alcanzados,
    pct_en_red: parsed.metrics.pct_en_red,
    pct_fuera_red: parsed.metrics.pct_fuera_red,
    compartidos: parsed.metrics.compartidos,
    guardados: parsed.metrics.guardados,
    interacciones_sociales: parsed.metrics.interacciones_sociales,
    visualizaciones_video: parsed.metrics.visualizaciones_video,
    visualizaciones_perfil: parsed.metrics.visualizaciones_perfil,
    seguidores_obtenidos: parsed.metrics.seguidores_obtenidos,
  };
  const { error: postError } = await supabase.from('posts').upsert(postRow, { onConflict: 'orden' });
  if (postError) throw new Error(`No se pudo cargar el post 10: ${postError.message}`);

  const [post10] = await selectAll(supabase.from('posts').select('id,orden').eq('orden', 10), 'No se pudo leer el post 10');
  const reactionRows = matchedReactions.map(({ metodo_match: _metodoMatch, ...reaction }) => ({ ...reaction, post_id: post10.id }));
  const { error: reactionsError } = await supabase.from('reacciones').upsert(reactionRows, { onConflict: 'post_id,nombre,tipo' });
  if (reactionsError) throw new Error(`No se pudieron cargar las reacciones del post 10: ${reactionsError.message}`);

  const allPostsAfter = await selectAll(supabase.from('posts').select('id,orden').order('orden'), 'No se pudieron verificar posts');
  if (allPostsAfter.length !== 10 || allPostsAfter.some((post, index) => post.orden !== index + 1)) {
    throw new Error(`Verificación fallida: quedaron ${allPostsAfter.length} posts con órdenes ${allPostsAfter.map((post) => post.orden).join(', ')}.`);
  }
  const post10Reactions = await selectAll(
    supabase.from('reacciones').select('*').eq('post_id', post10.id).order('id'),
    'No se pudieron verificar reacciones del post 10',
  );
  if (post10Reactions.length !== EXPECTED_REACTIONS) {
    throw new Error(`El post 10 quedó con ${post10Reactions.length} reacciones; se esperaban ${EXPECTED_REACTIONS}.`);
  }

  const legacyAfter = await snapshotPostsOneToNine(supabase);
  if (legacyBefore.hash !== legacyAfter.hash) {
    throw new Error(`Los posts 1..9 o sus reacciones cambiaron: hash antes ${legacyBefore.hash}, después ${legacyAfter.hash}.`);
  }

  const allReactions = await selectAll(supabase.from('reacciones').select('post_id,nombre').order('id'), 'No se pudieron recalcular reacciones');
  const postsByPerson = new Map();
  for (const reaction of allReactions) {
    const posts = postsByPerson.get(reaction.nombre) || new Set();
    posts.add(String(reaction.post_id));
    postsByPerson.set(reaction.nombre, posts);
  }
  const top = [...postsByPerson.entries()]
    .map(([nombre, posts]) => ({ nombre, posts_reaccionados: posts.size }))
    .sort((a, b) => b.posts_reaccionados - a.posts_reaccionados || a.nombre.localeCompare(b.nombre, 'es'))
    .slice(0, 10);
  const unmatched = matchedReactions.filter((reaction) => !reaction.en_conexiones)
    .map(({ nombre, grado }) => ({ nombre, grado }));
  const gradeTwoMatched = matchedReactions.filter((reaction) => reaction.grado === 2 && reaction.en_conexiones)
    .map(({ nombre, metodo_match: metodo }) => ({ nombre, metodo }));

  console.info(JSON.stringify({
    post_10: {
      titulo,
      reacciones_cargadas: post10Reactions.length,
      por_subtipo: reactionBreakdown(post10Reactions, 'subtipo'),
      por_grado: reactionBreakdown(post10Reactions, 'grado'),
      no_matcheados: unmatched,
      grado_2_matcheados_inesperadamente: gradeTwoMatched,
    },
    integridad_posts_1_a_9: {
      intactos: true,
      posts_antes: legacyBefore.posts.length,
      posts_despues: legacyAfter.posts.length,
      reacciones_antes: legacyBefore.reactions.length,
      reacciones_despues: legacyAfter.reactions.length,
      sha256_antes: legacyBefore.hash,
      sha256_despues: legacyAfter.hash,
    },
    posts_total: allPostsAfter.length,
    top_10_por_posts_reaccionados: top,
  }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { normalize, parseReactions, buildConnectionIndex, matchConnection };
