/**
 * La foto del dueño no viaja con los contactos: el actor lo excluye de su
 * propia red. Sí aparece como autor de las publicaciones scrappeadas.
 */

function firstHttpUrl(values) {
  return values.find((value) => typeof value === 'string' && /^https?:\/\//i.test(value.trim()));
}

function fromPictureList(pictures) {
  if (!Array.isArray(pictures) || pictures.length === 0) return null;
  const first = pictures[0];
  if (typeof first === 'string') return first;
  return first?.url ?? first?.src ?? null;
}

function pickOwnerPhoto(posts = []) {
  for (const post of posts) {
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
