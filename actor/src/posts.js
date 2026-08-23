/**
 * Normalización de publicaciones.
 *
 * Este actor EXTRAE, no evalúa. Deja los posts con nombres de campo
 * consistentes, las métricas como números y las características del texto ya
 * medidas, para que el módulo de evaluación del backend correlacione sin tener
 * que adivinar de qué scraper vinieron.
 *
 * La frontera: acá se MIDE lo que es objetivo (cuántas palabras, si tiene link,
 * cuál es la primera línea). Lo que significa cada cosa — si el hook funciona,
 * si el copy sirve, qué cambiar — lo decide el evaluador.
 */

/**
 * Las métricas sociales son SIEMPRE enteros, así que cualquier punto o coma es
 * separador de miles y no decimal. Parsearlo con Number() directo convierte
 * "1.240" en 1,24 y el evaluador saca conclusiones invertidas.
 *
 * También cubre los sufijos que devuelven varios scrapers: "1.2K", "3,4M".
 */
function parseMetric(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  // Un array u objeto no es una métrica. harvestapi manda `engagement.reactions`
  // como `[{type, count}, ...]`: stringifyarlo saca dígitos de los conteos y
  // el "total" queda mal. Si no es número ni string, no vino.
  if (typeof value !== 'string') return null;

  const text = value.trim();
  const suffix = text.match(/([\d.,]+)\s*([KkMm])\b/);
  if (suffix) {
    const base = Number(suffix[1].replace(',', '.'));
    if (Number.isNaN(base)) return null;
    return Math.round(base * (suffix[2].toLowerCase() === 'k' ? 1000 : 1000000));
  }

  const digits = text.replace(/[^\d]/g, '');
  if (!digits) return null;
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Dónde puede estar una métrica, en orden.
 *
 * harvestapi anida likes/comments/shares en `engagement`, no en la raíz.
 * Buscar solo arriba devuelve null en todos los posts — sin error — y el
 * promedio da 0 o NaN. Si un campo sale null, primero se mira si está anidado.
 *
 * `author` no entra: su `linkedinUrl` es el perfil, no el post.
 */
function fuentes(row) {
  const out = [row];
  for (const key of ['engagement', 'stats', 'metrics']) {
    const nested = row[key];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) out.push(nested);
  }
  return out;
}

function pickNumber(row, keys) {
  for (const fuente of fuentes(row)) {
    for (const key of keys) {
      const parsed = parseMetric(fuente[key]);
      if (parsed !== null) return parsed;
    }
  }
  return null;
}

function pickString(row, keys) {
  for (const fuente of fuentes(row)) {
    for (const key of keys) {
      const value = fuente[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
  }
  return '';
}

/** harvestapi llama `linkedinUrl` a la URL del post, no `url`. */
function pickPostUrl(row) {
  return pickString(row, ['url', 'postUrl', 'ShareLink', 'link', 'permalink', 'linkedinUrl']);
}

function pickAuthor(row) {
  const nested = row.author;
  if (nested && typeof nested === 'object' && typeof nested.name === 'string' && nested.name.trim()) {
    return nested.name.trim();
  }
  return pickString(row, ['authorName', 'authorFullName', 'author']);
}

/**
 * harvestapi manda `postedAt` como `{timestamp, date, postedAgoText}`, no como
 * string. pickString lo descartaba y la fecha quedaba vacía sin error.
 */
function pickDate(row) {
  for (const value of [row.postedAt, row.date, row.publishedAt, row.time]) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (value && typeof value === 'object') {
      if (typeof value.date === 'string' && value.date.trim()) return value.date.trim();
      if (typeof value.timestamp === 'number') return new Date(value.timestamp).toISOString();
    }
  }
  return pickString(row, ['Date', 'Share Date']);
}

const ROW_TYPES = new Set(['post', 'comment', 'reaction', 'like']);

function pickMediaType(row) {
  const explicit = pickString(row, ['mediaType', 'postType']);
  if (explicit) return explicit;
  const type = pickString(row, ['type']);
  if (type && !ROW_TYPES.has(type.toLowerCase())) return type;
  return '';
}

const EMOJI = /\p{Extended_Pictographic}/gu;

/**
 * Características medibles del copy.
 *
 * Todo lo de acá es objetivo y verificable: se cuenta, no se opina. Es la
 * materia prima con la que el evaluador va a poder decir "tus posts de menos
 * de 600 caracteres que abren con pregunta rinden 3x" — pero esa conclusión la
 * saca él, con tus datos, no la asumimos nosotros.
 */
function describeCopy(text) {
  const trimmed = text.trim();
  const lines = trimmed.split('\n').filter((l) => l.trim());
  const words = trimmed.split(/\s+/).filter(Boolean);

  // El hook es lo único que ve alguien antes de apretar "ver más". LinkedIn
  // corta alrededor de los 200 caracteres, así que ahí se juega todo.
  const firstLine = lines[0] ?? '';
  const hashtags = trimmed.match(/#[\p{L}\p{N}_]+/gu) ?? [];
  const mentions = trimmed.match(/@[\p{L}\p{N}_-]+/gu) ?? [];

  return {
    firstLine,
    hook: trimmed.slice(0, 200),
    charCount: trimmed.length,
    wordCount: words.length,
    lineCount: lines.length,
    /** Párrafos separados por línea en blanco: el formato "aireado" de LinkedIn. */
    paragraphCount: trimmed.split(/\n\s*\n/).filter((p) => p.trim()).length,
    firstLineChars: firstLine.length,
    startsWithQuestion: /\?/.test(firstLine),
    endsWithQuestion: trimmed.trimEnd().endsWith('?'),
    hasLink: /https?:\/\//.test(trimmed),
    hasNumbers: /\d/.test(trimmed),
    /** Cifras con signo de moneda o porcentaje: la evidencia cuantificada. */
    hasQuantifiedClaim: /(\$|€|%)\s?\d|\d\s?(%|USD|EUR)/.test(trimmed),
    hashtags,
    hashtagCount: hashtags.length,
    mentionCount: mentions.length,
    emojiCount: (trimmed.match(EMOJI) ?? []).length,
    /** Listas con viñetas o guiones, otro formato frecuente en el canal. */
    hasBulletList: /^\s*[-•·*]\s+/m.test(trimmed),
  };
}

/**
 * Normaliza publicaciones de cualquier fuente: export oficial de LinkedIn
 * (Shares.csv), exportación de analytics de creador, o la salida de un actor.
 *
 * Las métricas ausentes quedan en `null`, no en 0. La diferencia importa: cero
 * reacciones es un dato, "no sabemos cuántas" es otro, y confundirlos arruina
 * cualquier promedio que calcule el evaluador.
 */
function normalizePosts(rows) {
  return rows.map((row, index) => {
    const text = pickString(row, [
      'text', 'content', 'ShareCommentary', 'commentary', 'postText', 'description',
    ]);

    // `likes` antes que `reactions`: en harvestapi `engagement.likes` es el
    // total (33) y `engagement.reactions` es el desglose por tipo, un array.
    const reactions = pickNumber(row, ['likes', 'numLikes', 'likesCount', 'reactions', 'Reactions']);
    const comments = pickNumber(row, ['comments', 'numComments', 'Comments', 'commentsCount']);
    const shares = pickNumber(row, ['shares', 'numShares', 'reposts', 'Shares', 'sharesCount']);
    const impressions = pickNumber(row, ['impressions', 'views', 'Impressions', 'impressionCount']);

    return {
      index,
      text,
      copy: describeCopy(text),

      date: pickDate(row),
      url: pickPostUrl(row),
      author: pickAuthor(row),
      mediaType: pickMediaType(row),

      reactions,
      comments,
      shares,
      impressions,

      /** Qué métricas vinieron de verdad. El evaluador necesita saberlo. */
      metricsAvailable: {
        reactions: reactions !== null,
        comments: comments !== null,
        shares: shares !== null,
        impressions: impressions !== null,
      },

      /** La fila cruda, por si el evaluador necesita un campo que no mapeamos. */
      raw: row,
    };
  });
}

/**
 * Promedio de reacciones y comentarios sobre los posts que SÍ traen métrica.
 *
 * Un post sin métrica medida no es un post con cero reacciones. Mezclar las
 * dos cosas ensucia el promedio: harvestapi sin cookie deja `impressions` en
 * null siempre, y a veces un post público llega sin `engagement.likes`.
 */
function summarizePostMetrics(posts) {
  const conMetrica = posts.filter((p) => typeof p.reactions === 'number');
  if (conMetrica.length === 0) {
    return {
      posts: posts.length,
      conMetrica: 0,
      promedioReacciones: null,
      promedioComentarios: null,
    };
  }

  return {
    posts: posts.length,
    conMetrica: conMetrica.length,
    promedioReacciones:
      conMetrica.reduce((suma, p) => suma + p.reactions, 0) / conMetrica.length,
    promedioComentarios:
      conMetrica.reduce((suma, p) => suma + (p.comments ?? 0), 0) / conMetrica.length,
  };
}

module.exports = {
  normalizePosts,
  describeCopy,
  parseMetric,
  pickPostUrl,
  summarizePostMetrics,
};
