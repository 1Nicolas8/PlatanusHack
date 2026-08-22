const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const DEFAULT_SOURCE_PATH = '/Users/bryanriano/Documents/Obsidian Vault/Untitled.md';
const END_MARKER = 'Los miembros que publican una vez a la semana';
const PROFILE_MARKER = 'Ver el perfil de ';
const EXPECTED_LIKES = [17, 13, 6, 0];
const EXPECTED_IMPRESSIONS = [1074, 662, 209, 630];
const FIRST_ORDER = 6;
const AUTHOR = 'Bryan Alexander Riaño Romero';

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanText(value) {
  return String(value || '')
    .replace(/\*\*/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nonEmpty(lines) {
  return lines.map((line) => cleanText(line)).filter(Boolean);
}

function splitPostBlocks(source) {
  const blocks = [];
  let current = [];

  for (const line of source.split(/\r?\n/)) {
    current.push(line);
    if (line.startsWith(END_MARKER)) {
      blocks.push(current);
      current = [];
    }
  }

  if (blocks.length !== EXPECTED_LIKES.length) {
    throw new Error(`Se detectaron ${blocks.length} bloques por patrón; se esperaban ${EXPECTED_LIKES.length}.`);
  }

  return { blocks, trailingLines: current };
}

function extractProfileName(line) {
  const imageMatch = line.match(/!\[Ver el perfil de ([^\]]+)\]/);
  if (imageMatch) return cleanText(imageMatch[1]);

  const index = line.lastIndexOf(PROFILE_MARKER);
  if (index === -1) return null;

  return cleanText(line.slice(index + PROFILE_MARKER.length));
}

function isDegreeLine(line) {
  return /·\s*(?:1er|2º|3er\+)/.test(line);
}

function extractHeadline(lines, startIndex) {
  const degreeOffset = lines.slice(startIndex + 1, startIndex + 12).findIndex(isDegreeLine);
  if (degreeOffset === -1) return null;

  const degreeIndex = startIndex + degreeOffset + 1;
  for (let index = degreeIndex + 1; index < Math.min(lines.length, degreeIndex + 9); index += 1) {
    const candidate = cleanText(lines[index]);
    if (!candidate || /^Out of network/.test(candidate) || isDegreeLine(candidate)) continue;
    if (candidate.startsWith('](') || candidate.startsWith('- ') || candidate.startsWith('![')) continue;
    return candidate;
  }
  return null;
}

function parseLikes(lines) {
  const likes = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].includes(PROFILE_MARKER)) continue;
    const nombre = extractProfileName(lines[index]);
    if (!nombre) continue;
    likes.push({ nombre, headline: extractHeadline(lines, index), tipo: 'like', texto_comentario: null });
  }
  return likes;
}

function deduplicateReactions(reactions) {
  const unique = new Map();
  const duplicates = [];

  for (const reaction of reactions) {
    const key = `${reaction.nombre}\u0000${reaction.tipo}`;
    if (unique.has(key)) {
      duplicates.push(reaction.nombre);
      if (reaction.tipo === 'comentario' && reaction.texto_comentario) {
        const existing = unique.get(key);
        existing.texto_comentario = `${existing.texto_comentario}\n\n${reaction.texto_comentario}`;
      }
      continue;
    }
    unique.set(key, { ...reaction });
  }

  return { reactions: [...unique.values()], duplicates };
}

function parseComments(lines) {
  const comments = [];

  for (let index = 0; index < lines.length; index += 1) {
    const rawHeader = cleanText(lines[index]);
    if (!rawHeader.startsWith('### ')) continue;
    if (rawHeader.includes(' Autor')) continue;

    const match = rawHeader.match(/^###\s+(.+?)\s+•\s*(?:1er|2º|3er\+)$/);
    if (!match) continue;

    const nombre = cleanText(match[1]);
    if (!nombre || normalize(nombre) === normalize(AUTHOR)) continue;

    const nextHeaderOffset = lines.slice(index + 1).findIndex((line) => cleanText(line).startsWith('### '));
    const section = lines.slice(index + 1, nextHeaderOffset === -1 ? lines.length : index + 1 + nextHeaderOffset);
    const compact = nonEmpty(section);
    const timeIndex = compact.findIndex((line) => /^\d+\s+(?:h|d[ií]as?|semanas?|mes(?:es)?)$/.test(line));
    const headline = compact.slice(0, timeIndex === -1 ? 0 : timeIndex)
      .find((line) => !line.startsWith('](') && !line.startsWith('![')) || null;
    const content = compact.slice(timeIndex === -1 ? 0 : timeIndex + 1);
    const stopIndex = content.findIndex((line) => /^(Encantar|Recomendar|Responder|Mostrar traducción|Descubrimiento)/.test(line));
    const texto = content.slice(0, stopIndex === -1 ? content.length : stopIndex).join('\n').trim();
    if (!texto) continue;

    comments.push({ nombre, headline, tipo: 'comentario', texto_comentario: texto });
  }

  return comments;
}

function findCommentWrapperStart(lines) {
  const headerIndex = lines.findIndex((line) => cleanText(line).startsWith('### '));
  if (headerIndex === -1) return -1;

  for (let index = headerIndex - 1; index >= Math.max(0, headerIndex - 15); index -= 1) {
    if (lines[index].trim() === '[') return index;
  }
  return headerIndex;
}

function findText(lines, order) {
  const separatorIndex = lines.findIndex((line) => /^[-—]{10,}\s*$/.test(line.trim()));
  const start = separatorIndex === -1 ? 0 : separatorIndex + 1;
  const boundaries = [
    lines.findIndex((line) => line.includes(PROFILE_MARKER)),
    findCommentWrapperStart(lines),
    lines.findIndex((line) => cleanText(line) === 'Descubrimiento'),
  ].filter((index) => index >= start);
  const end = boundaries.length ? Math.min(...boundaries) : lines.length;
  const text = nonEmpty(lines.slice(start, end)).join('\n').trim();

  if (!text) throw new Error(`Post ${order}: no se encontró texto antes de reacciones/comentarios.`);
  return text;
}

function findImpressions(lines, order) {
  const index = lines.findIndex((line) => cleanText(line) === 'Impresiones');
  if (index === -1) throw new Error(`Post ${order}: no se encontró Impresiones.`);
  const value = nonEmpty(lines.slice(Math.max(0, index - 3), index)).at(-1);
  const impressions = Number(value.replace(/\./g, ''));
  if (!Number.isInteger(impressions)) throw new Error(`Post ${order}: impresiones inválidas: ${value}.`);
  return impressions;
}

function parsePosts(source) {
  const { blocks, trailingLines } = splitPostBlocks(source);

  return {
    trailingLines: trailingLines.length,
    posts: blocks.map((lines, index) => {
      const order = FIRST_ORDER + index;
      const listedLikes = parseLikes(lines);
      const listedComments = parseComments(lines);
      const deduplicated = deduplicateReactions([...listedLikes, ...listedComments]);
      const likes = deduplicated.reactions.filter((reaction) => reaction.tipo === 'like');
      const comments = deduplicated.reactions.filter((reaction) => reaction.tipo === 'comentario');
      const texto = findText(lines, order);
      const impresiones = findImpressions(lines, order);

      if (likes.length !== EXPECTED_LIKES[index]) {
        throw new Error(`Post ${order}: ${likes.length} reactores únicos; se esperaban ${EXPECTED_LIKES[index]} (tarjetas fuente: ${listedLikes.length}).`);
      }
      if (impresiones !== EXPECTED_IMPRESSIONS[index]) {
        throw new Error(`Post ${order}: ${impresiones} impresiones; se esperaban ${EXPECTED_IMPRESSIONS[index]}.`);
      }

      return {
        orden: order,
        titulo: texto.split('\n')[0],
        texto,
        fecha: null,
        tipo: 'publicacion',
        impresiones,
        total_reacciones: likes.length,
        likes,
        comments,
        tarjetas_reacciones: listedLikes.length,
        duplicados_reacciones: deduplicated.duplicates,
      };
    }),
  };
}

function buildConnectionIndex(conexiones) {
  const exact = new Map();
  const normalized = new Map();
  for (const conexion of conexiones) {
    for (const [index, key] of [[exact, conexion.nombre], [normalized, normalize(conexion.nombre)]]) {
      const entries = index.get(key) || [];
      entries.push(conexion);
      index.set(key, entries);
    }
  }
  return { exact, normalized };
}

function matchConnection(nombre, index) {
  const exactMatches = index.exact.get(nombre) || [];
  if (exactMatches.length === 1) return exactMatches[0];
  const normalizedMatches = index.normalized.get(normalize(nombre)) || [];
  return normalizedMatches.length === 1 ? normalizedMatches[0] : null;
}

function stableHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function selectAll(query, label) {
  const { data, error } = await query;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

async function snapshotLegacy(supabase) {
  const posts = await selectAll(
    supabase.from('posts').select('*').gte('orden', 1).lte('orden', 5).order('orden'),
    'No se pudieron leer posts 1..5',
  );
  const postIds = posts.map((post) => post.id);
  const reactions = postIds.length
    ? await selectAll(
      supabase.from('reacciones').select('*').in('post_id', postIds).order('id'),
      'No se pudieron leer reacciones de posts 1..5',
    )
    : [];

  return {
    posts,
    reactions,
    hash: stableHash({ posts, reactions }),
    reactionsByOrder: posts.map((post) => ({
      orden: post.orden,
      cantidad: reactions.filter((reaction) => String(reaction.post_id) === String(post.id)).length,
    })),
  };
}

function getSourcePath(argv) {
  const positional = argv.find((argument) => !argument.startsWith('--'));
  return path.resolve(positional || process.env.POSTS_SOURCE_PATH || DEFAULT_SOURCE_PATH);
}

async function main() {
  const sourcePath = getSourcePath(process.argv.slice(2));
  const dryRun = process.argv.includes('--dry-run');
  const parsed = parsePosts(await fs.readFile(sourcePath, 'utf8'));

  if (dryRun) {
    console.info(JSON.stringify({
      modo: 'dry-run',
      fuente: sourcePath,
      lineas_fuera_de_bloques: parsed.trailingLines,
      posts: parsed.posts.map((post) => ({
        orden: post.orden,
        titulo: post.titulo,
        impresiones: post.impresiones,
        tarjetas_fuente: post.tarjetas_reacciones,
        likes_unicos: post.likes.length,
        comentarios_audiencia: post.comments.length,
        duplicados_descartados: post.duplicados_reacciones,
      })),
    }, null, 2));
    return;
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en backend/.env.');
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const allPostsBefore = await selectAll(supabase.from('posts').select('id,orden').order('orden'), 'No se pudieron leer posts existentes');
  const existingOrders = allPostsBefore.map((post) => post.orden);
  const allowedOrders = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const unexpectedOrders = existingOrders.filter((order) => !allowedOrders.has(order));
  if (unexpectedOrders.length) throw new Error(`Hay posts fuera de orden 1..9: ${unexpectedOrders.join(', ')}. No se modificó la base.`);
  if (![5, 9].includes(allPostsBefore.length)) {
    throw new Error(`Antes de cargar había ${allPostsBefore.length} posts (órdenes: ${existingOrders.join(', ')}); se esperaban 5 o 9. No se modificó la base.`);
  }
  for (const order of [1, 2, 3, 4, 5]) {
    if (!existingOrders.includes(order)) throw new Error(`Falta el post existente orden ${order}. No se modificó la base.`);
  }

  const legacyBefore = await snapshotLegacy(supabase);
  const conexiones = await selectAll(supabase.from('conexiones').select('id,nombre'), 'No se pudieron leer conexiones');
  const connectionIndex = buildConnectionIndex(conexiones);
  const postRows = parsed.posts.map((post) => ({
    orden: post.orden,
    titulo: post.titulo,
    texto: post.texto,
    fecha: post.fecha,
    tipo: post.tipo,
    impresiones: post.impresiones,
    total_reacciones: post.total_reacciones,
  }));

  const { error: postsError } = await supabase.from('posts').upsert(postRows, { onConflict: 'orden' });
  if (postsError) throw new Error(`No se pudieron cargar posts 6..9: ${postsError.message}`);

  const persistedPosts = await selectAll(supabase.from('posts').select('id,orden').order('orden'), 'No se pudieron leer posts cargados');
  const postIds = new Map(persistedPosts.map((post) => [post.orden, post.id]));
  const reactions = parsed.posts.flatMap((post) => [...post.likes, ...post.comments].map((reaction) => {
    const conexion = matchConnection(reaction.nombre, connectionIndex);
    return {
      ...reaction,
      post_id: postIds.get(post.orden),
      conexion_id: conexion ? conexion.id : null,
      en_conexiones: Boolean(conexion),
    };
  }));

  if (reactions.length) {
    const { error: reactionsError } = await supabase.from('reacciones').upsert(reactions, { onConflict: 'post_id,nombre,tipo' });
    if (reactionsError) throw new Error(`No se pudieron cargar reacciones de posts 6..9: ${reactionsError.message}`);
  }

  const allPostsAfter = await selectAll(supabase.from('posts').select('id,orden').order('orden'), 'No se pudieron verificar posts');
  if (allPostsAfter.length !== 9 || allPostsAfter.some((post, index) => post.orden !== index + 1)) {
    throw new Error(`Verificación fallida: quedaron ${allPostsAfter.length} posts con órdenes ${allPostsAfter.map((post) => post.orden).join(', ')}.`);
  }

  const legacyAfter = await snapshotLegacy(supabase);
  if (legacyBefore.hash !== legacyAfter.hash) {
    throw new Error(`Los posts 1..5 o sus reacciones cambiaron: hash antes ${legacyBefore.hash}, después ${legacyAfter.hash}.`);
  }

  const allReactions = await selectAll(supabase.from('reacciones').select('*').order('id'), 'No se pudieron verificar reacciones');
  const newPostIds = new Map(allPostsAfter.filter((post) => post.orden >= FIRST_ORDER).map((post) => [String(post.id), post.orden]));
  const newReactions = allReactions.filter((reaction) => newPostIds.has(String(reaction.post_id)));
  const newLikes = newReactions.filter((reaction) => reaction.tipo === 'like');
  const unmatchedLikes = [...new Set(newLikes.filter((reaction) => !reaction.en_conexiones).map((reaction) => reaction.nombre))]
    .sort((a, b) => a.localeCompare(b, 'es'));
  const unmatchedComments = [...new Set(newReactions.filter((reaction) => reaction.tipo === 'comentario' && !reaction.en_conexiones).map((reaction) => reaction.nombre))]
    .sort((a, b) => a.localeCompare(b, 'es'));

  const likedPostsByPerson = new Map();
  for (const reaction of allReactions.filter((row) => row.tipo === 'like')) {
    const postsForPerson = likedPostsByPerson.get(reaction.nombre) || new Set();
    postsForPerson.add(String(reaction.post_id));
    likedPostsByPerson.set(reaction.nombre, postsForPerson);
  }
  const top = [...likedPostsByPerson.entries()]
    .map(([nombre, postIdsForPerson]) => ({ nombre, posts: postIdsForPerson.size }))
    .sort((a, b) => b.posts - a.posts || a.nombre.localeCompare(b.nombre, 'es'))
    .slice(0, 10);
  const matchedConnectionIds = new Set(allReactions.filter((reaction) => reaction.en_conexiones
      && reaction.conexion_id !== null && reaction.conexion_id !== undefined)
    .map((reaction) => String(reaction.conexion_id)));

  console.info(JSON.stringify({
    fuente: sourcePath,
    lineas_fuera_de_bloques: parsed.trailingLines,
    posts_nuevos: parsed.posts.map((post) => ({
      orden: post.orden,
      titulo: post.titulo,
      impresiones: post.impresiones,
      likes_esperados: EXPECTED_LIKES[post.orden - FIRST_ORDER],
      likes_cargados: newLikes.filter((reaction) => newPostIds.get(String(reaction.post_id)) === post.orden).length,
      comentarios_audiencia_cargados: newReactions.filter((reaction) => newPostIds.get(String(reaction.post_id)) === post.orden && reaction.tipo === 'comentario').length,
      tarjetas_fuente: post.tarjetas_reacciones,
      duplicados_descartados: post.duplicados_reacciones,
    })),
    duplicados_descartados_total: parsed.posts.reduce((total, post) => total + post.duplicados_reacciones.length, 0),
    reactores_like_nuevos_no_matcheados: { cantidad: unmatchedLikes.length, nombres: unmatchedLikes },
    comentaristas_nuevos_no_matcheados: { cantidad: unmatchedComments.length, nombres: unmatchedComments },
    resumen_nueve_posts: {
      posts_total: allPostsAfter.length,
      conexiones_total: conexiones.length,
      top_10_por_posts_con_like: top,
      conexiones_con_cero_reacciones: conexiones.length - matchedConnectionIds.size,
    },
    integridad_posts_1_a_5: {
      intactos: true,
      posts_antes: legacyBefore.posts.length,
      posts_despues: legacyAfter.posts.length,
      reacciones_antes: legacyBefore.reactions.length,
      reacciones_despues: legacyAfter.reactions.length,
      reacciones_por_post_antes: legacyBefore.reactionsByOrder,
      reacciones_por_post_despues: legacyAfter.reactionsByOrder,
      sha256_antes: legacyBefore.hash,
      sha256_despues: legacyAfter.hash,
    },
  }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { parsePosts, splitPostBlocks, normalize, matchConnection };
