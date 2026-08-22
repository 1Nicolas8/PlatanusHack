/**
 * La red construida desde el engagement público, sin sesión de LinkedIn.
 *
 * Por qué existe: la lista de conexiones de un perfil no es pública. Ningún
 * scraper la ve deslogueado y pedirla implica ceder la cookie `li_at` de una
 * cuenta real. Los comentarios de un post público, en cambio, se renderizan
 * para cualquiera — nombre, headline y perfil de cada persona incluidos.
 *
 * El cambio de fuente cambia qué red es, y para bien:
 *
 *   lista de conexiones   quién aceptó una solicitud alguna vez
 *   engagement            quién efectivamente te lee y responde
 *
 * Para decidir a quién cultivar, lo segundo es mejor señal. Y la temperatura
 * deja de ser un modelo: es el conteo de veces que esa persona interactuó.
 *
 * Honestidad sobre las aristas: dos personas que comentaron el mismo post
 * comparten AUDIENCIA — eso es observado. No prueba que se conozcan. El grafo
 * las trata como adyacentes porque para propagación de alcance es lo que
 * importa, pero el reporte no debe llamarlas "conexiones".
 */

/** Cada scraper nombra distinto lo mismo. Se cubren las formas usuales. */
function pick(row, keys) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

/**
 * Misma persona, distinta URL según el scraper: con `www`, con barra final,
 * con querystring de tracking. Sin normalizar, una persona que interactuó
 * cinco veces entra como cinco nodos tibios en vez de uno caliente.
 */
function profileKey(url) {
  const match = String(url).match(/linkedin\.com\/in\/([^/?#]+)/i);
  if (!match) return '';
  return `https://linkedin.com/in/${decodeURIComponent(match[1]).toLowerCase()}`;
}

function personOf(row) {
  const name =
    pick(row, ['name', 'fullName', 'authorName', 'actorName', 'commenterName']) ||
    [pick(row, ['firstName']), pick(row, ['lastName'])].filter(Boolean).join(' ').trim();

  const url = profileKey(
    pick(row, [
      'profileUrl', 'authorProfileUrl', 'linkedinUrl', 'actorUrl',
      'commenterProfileUrl', 'profileLink', 'url',
    ]),
  );

  return {
    name,
    url,
    headline: pick(row, [
      'headline', 'authorHeadline', 'occupation', 'subtitle', 'actorDescription', 'title',
    ]),
    photoUrl: pick(row, [
      'profilePicture', 'profilePictureUrl', 'authorProfilePicture', 'photoUrl', 'image', 'avatar',
    ]),
  };
}

/** Un comentario dice más que una reacción: cuesta más y se lee. */
function isComment(row) {
  return Boolean(pick(row, ['commentText', 'comment', 'text', 'message']));
}

function postOf(row) {
  return pick(row, ['postUrl', 'postId', 'post', 'urn', 'postUrn', 'shareUrl']);
}

/**
 * @param {object[]} rows filas de un scraper de comentarios/reacciones
 * @param {object} [options]
 * @param {number} [options.maxEdgesPerPost] tope de pares por post: un post
 *   viral con 2.000 personas genera dos millones de pares y no aporta nada
 *   sobre los primeros miles. Se toma a quienes más interactúan.
 * @returns {{contacts: object[], edges: [string, string][]}}
 */
function contactsFromEngagement(rows, { maxEdgesPerPost = 2000 } = {}) {
  if (!Array.isArray(rows) || rows.length === 0) return { contacts: [], edges: [] };

  const byProfile = new Map();
  const porPost = new Map();

  for (const row of rows) {
    const person = personOf(row);
    // Sin perfil ni nombre no hay a quién atribuir la interacción. Crear un
    // nodo igual sería inventar una persona.
    if (!person.url && !person.name) continue;

    const key = person.url || `nombre:${person.name.toLowerCase()}`;
    let contact = byProfile.get(key);
    if (!contact) {
      contact = {
        ...person,
        interactions: 0,
        comments: 0,
        reactions: 0,
        posts: new Set(),
      };
      byProfile.set(key, contact);
    }

    // La primera fila puede venir sin headline y la segunda traerlo. Se
    // completa lo que falte sin pisar lo que ya está.
    contact.headline ||= person.headline;
    contact.photoUrl ||= person.photoUrl;

    contact.interactions += 1;
    if (isComment(row)) contact.comments += 1;
    else contact.reactions += 1;

    const post = postOf(row);
    if (post) {
      contact.posts.add(post);
      if (!porPost.has(post)) porPost.set(post, new Set());
      porPost.get(post).add(key);
    }
  }

  const contacts = [...byProfile.values()]
    .map(({ posts, ...contact }) => ({ ...contact, postsEngaged: posts.size }))
    .sort((a, b) => b.interactions - a.interactions || a.name.localeCompare(b.name));

  // Orden de interacción para que el recorte por tope sea determinista y se
  // quede con la gente que más participa, no con la que el scraper puso primero.
  const rank = new Map([...byProfile.keys()].map((key, i) => [key, i]));
  const peso = (key) => byProfile.get(key).interactions;

  const edges = [];
  for (const participantes of porPost.values()) {
    const ordenados = [...participantes].sort(
      (a, b) => peso(b) - peso(a) || rank.get(a) - rank.get(b),
    );
    let generadas = 0;
    for (let i = 0; i < ordenados.length && generadas < maxEdgesPerPost; i += 1) {
      for (let j = i + 1; j < ordenados.length && generadas < maxEdgesPerPost; j += 1) {
        edges.push([byProfile.get(ordenados[i]).url, byProfile.get(ordenados[j]).url]);
        generadas += 1;
      }
    }
  }

  return { contacts, edges };
}

module.exports = { contactsFromEngagement, profileKey };
