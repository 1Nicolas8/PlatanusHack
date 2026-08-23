/**
 * La foto del dueño no viaja con los contactos: el actor lo excluye de su
 * propia red. Sí aparece como autor de las publicaciones scrappeadas.
 */

/**
 * La URL puede venir suelta o envuelta en un objeto.
 *
 * harvestapi manda `author.avatar` como `{url, width, height}`, no como string.
 * Aceptando solo strings el objeto se descartaba en silencio y el resultado era
 * `null` con la foto ahi mismo — el sintoma era "el dueño no tiene foto".
 */
function comoUrl(value) {
  const candidato = typeof value === 'string' ? value : value?.url ?? value?.src;
  if (typeof candidato !== 'string') return null;
  return /^https?:\/\//i.test(candidato.trim()) ? candidato.trim() : null;
}

function firstHttpUrl(values) {
  for (const value of values) {
    const url = comoUrl(value);
    if (url) return url;
  }
  return null;
}

function fromPictureList(pictures) {
  if (!Array.isArray(pictures) || pictures.length === 0) return null;
  const first = pictures[0];
  if (typeof first === 'string') return first;
  return first?.url ?? first?.src ?? null;
}

/**
 * El slug del perfil, para saber si un post es del dueño o un repost ajeno.
 * Tolera www, barra final y querystring — la misma URL llega de mil formas.
 */
function slugDe(url) {
  const m = String(url ?? '').match(/linkedin\.com\/in\/([^/?#]+)/i);
  return m ? decodeURIComponent(m[1]).toLowerCase() : '';
}

/**
 * @param {object[]} posts publicaciones scrapeadas
 * @param {string} [perfilUrl] de quien tiene que ser la foto. Sin esto se toma
 *   el primer post con foto, que es lo que hacia antes — y por eso a veces
 *   mostraba la cara de otro: el scraper trae reposts, cuyo autor NO es el
 *   dueño del perfil. Medido: 2 de 7 posts de un perfil real eran reposts.
 */
function pickOwnerPhoto(posts = [], perfilUrl) {
  const dueno = slugDe(perfilUrl);

  for (const post of posts) {
    if (dueno) {
      const crudo = post?.raw && typeof post.raw === 'object' ? post.raw : post;
      const autor = crudo?.author ?? {};
      const suyo =
        String(autor.publicIdentifier ?? '').toLowerCase() === dueno ||
        slugDe(autor.linkedinUrl) === dueno;
      // Preferir ninguna foto antes que la de otra persona presentada como el
      // dueño: un placeholder se entiende, una cara equivocada engaña.
      if (!suyo) continue;
    }

    const raw = post?.raw && typeof post.raw === 'object' ? post.raw : post;
    const author = raw?.author && typeof raw.author === 'object' ? raw.author : {};

    const candidate = firstHttpUrl([
      post?.authorPhoto,
      post?.authorPhotoUrl,
      author.avatar,
      author.photoUrl,
      author.profilePicture,
      author.profilePictureUrl,
      author.authorProfilePicture,
      fromPictureList(author.profilePictures),
      fromPictureList(author.profilePictureUrls),
      raw?.authorProfilePicture,
      raw?.authorPicture,
      raw?.authorAvatar,
      raw?.profilePicture,
      raw?.profilePictureUrl,
    ]);

    if (candidate) return candidate.trim();
  }
  return null;
}

module.exports = { pickOwnerPhoto };
