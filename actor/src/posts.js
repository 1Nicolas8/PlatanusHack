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

  const text = String(value).trim();
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

function pickNumber(row, keys) {
  for (const key of keys) {
    const parsed = parseMetric(row[key]);
    if (parsed !== null) return parsed;
  }
  return null;
}

function pickString(row, keys) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
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

    const reactions = pickNumber(row, ['reactions', 'numLikes', 'likes', 'Reactions', 'likesCount']);
    const comments = pickNumber(row, ['comments', 'numComments', 'Comments', 'commentsCount']);
    const shares = pickNumber(row, ['shares', 'numShares', 'reposts', 'Shares', 'sharesCount']);
    const impressions = pickNumber(row, ['impressions', 'views', 'Impressions', 'impressionCount']);

    return {
      index,
      text,
      copy: describeCopy(text),

      date: pickString(row, ['date', 'postedAt', 'Date', 'Share Date', 'publishedAt', 'time']),
      url: pickString(row, ['url', 'postUrl', 'ShareLink', 'link', 'permalink']),
      author: pickString(row, ['author', 'authorName', 'authorFullName']),
      mediaType: pickString(row, ['mediaType', 'type', 'postType']),

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

module.exports = { normalizePosts, describeCopy, parseMetric };
