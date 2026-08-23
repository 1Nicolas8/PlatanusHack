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

/**
 * Cada scraper nombra distinto lo mismo, y algunos anidan la persona en un
 * subobjeto (`actor` en harvestapi) en vez de dejarla en la raíz. Se busca en
 * los dos niveles para no necesitar un mapeo por proveedor.
 */
function subobjetoPersona(row) {
  return [row.actor, row.author, row.commenter, row.profile].find(
    (f) => f && typeof f === 'object',
  );
}

function pick(row, keys, { soloPersona = false } = {}) {
  const persona = subobjetoPersona(row);
  // Cuando la persona viene anidada, sus campos ganan sobre los de la fila:
  // la fila describe la INTERACCION y la persona describe a quien la hizo.
  const fuentes = soloPersona
    ? [persona].filter(Boolean)
    : [persona, row].filter((f) => f && typeof f === 'object');

  for (const key of keys) {
    for (const fuente of fuentes) {
      const value = fuente[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
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

/**
 * El urn opaco (`/in/ACoAAD...`) no sirve para un humano: no se reconoce ni se
 * comparte. Las reacciones lo traen así y los comentarios traen el slug legible
 * de la misma persona, así que entre los dos gana el slug.
 */
function esUrn(url) {
  return /\/in\/acoaa/i.test(url);
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
    // El id interno del perfil es la unica clave estable entre una reaccion y
    // un comentario de la misma persona: las URLs no coinciden.
    //
    // OJO con `id` a nivel de fila: en harvestapi ese es el urn de LA
    // REACCION, distinto en cada interaccion. Usarlo como identidad hace que
    // nadie dedupee y que toda la red quede en 1 interaccion — un mapa de
    // calor plano que no parece roto, parece que nadie te lee. Por eso `id`
    // solo se acepta del subobjeto de la persona; de la fila, solo los
    // nombres que ya dicen explicitamente que son de ella.
    id:
      pick(row, ['id'], { soloPersona: true }) ||
      pick(row, ['actorId', 'profileId', 'authorId', 'commenterId']),
    headline: pick(row, [
      'headline', 'authorHeadline', 'occupation', 'position', 'subtitle',
      'actorDescription', 'title',
    ]),
    photoUrl: pick(row, [
      'pictureUrl', 'profilePicture', 'profilePictureUrl', 'authorProfilePicture',
      'photoUrl', 'image', 'avatar',
    ]),
  };
}

/**
 * Un comentario dice más que una reacción: cuesta más y se lee.
 *
 * Si el scraper declara el tipo, se le cree. Inferirlo por la presencia de
 * texto falla con un comentario vacío — que existe, son los de solo emoji.
 */
function esCompartido(row) {
  const tipo = pick(row, ['type', 'itemType']).toLowerCase();
  return tipo === 'repost' || tipo === 'share';
}

function isComment(row) {
  const tipo = pick(row, ['type', 'itemType']).toLowerCase();
  if (tipo === 'comment') return true;
  if (tipo === 'reaction' || tipo === 'like') return false;
  if (pick(row, ['reactionType'])) return false;
  return Boolean(pick(row, ['commentText', 'comment', 'commentary', 'text', 'message']));
}

function postOf(row) {
  const texto = pick(row, ['postUrl', 'postId', 'post', 'urn', 'postUrn', 'shareUrl']);
  if (texto) return texto;
  // harvestapi manda `postId` como número. pick solo lee strings, y sin esto
  // el historial queda sin post y el agente no sabe A QUÉ le reaccionó.
  if (row.postId !== undefined && row.postId !== null && row.postId !== '') {
    return String(row.postId);
  }
  return '';
}

function fechaDePost(post) {
  const raw = post?.postedAt ?? post?.date ?? post?.publishedAt;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  if (raw && typeof raw === 'object') {
    if (typeof raw.date === 'string' && raw.date.trim()) return raw.date.trim();
    if (typeof raw.timestamp === 'number') return new Date(raw.timestamp).toISOString();
  }
  return null;
}

/** Índice de publicaciones del scrape: el historial necesita fecha y gancho. */
function catalogoPosts(posts = []) {
  const byId = new Map();
  for (const post of posts) {
    const id = post?.id !== undefined && post?.id !== null ? String(post.id) : '';
    if (!id) continue;
    byId.set(id, {
      hook: String(post.content ?? post.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 180),
      fecha: fechaDePost(post),
      url: post.linkedinUrl ?? post.url ?? null,
    });
  }
  return byId;
}

/**
 * Cómo reaccionó esta persona, en el vocabulario que persiste el backend.
 *
 * `tipo` es like|comentario|compartir (check de la tabla). `subtipo` es el porqué
 * observable sin cookie: like / love (empatía) / celebrate (aplauso).
 *
 * El compartido es el más caro de los tres y el que más importa para la
 * simulación: es el único gesto que le muestra tu post a gente con la que no
 * estás conectado. Hasta acá se descartaba junto con las publicaciones propias
 * del dueño, y por eso la mezcla observada nunca tenía compartidos.
 */
function eventoDe(row, catalogo) {
  const postId = postOf(row);
  const publicado = catalogo.get(postId) ?? {};

  if (esCompartido(row)) {
    return {
      postId: postId || null,
      hook: publicado.hook || null,
      fecha: publicado.fecha || null,
      tipo: 'compartir',
      subtipo: null,
      comentario: pick(row, ['commentText', 'comment', 'commentary']) || null,
    };
  }

  if (isComment(row)) {
    return {
      postId: postId || null,
      hook: publicado.hook || null,
      fecha: publicado.fecha || null,
      tipo: 'comentario',
      subtipo: null,
      comentario: pick(row, ['commentText', 'comment', 'commentary', 'text', 'message']) || null,
    };
  }

  const crudo = String(row.reactionType ?? row.reaction ?? 'LIKE').toUpperCase();
  const subtipo = crudo === 'EMPATHY' || crudo === 'LOVE' ? 'love'
    : crudo === 'PRAISE' || crudo === 'CELEBRATE' || crudo === 'APPRECIATION' ? 'celebrate'
    : 'like';

  return {
    postId: postId || null,
    hook: publicado.hook || null,
    fecha: publicado.fecha || null,
    tipo: 'like',
    subtipo,
    comentario: null,
  };
}

/**
 * @param {object[]} rows filas de un scraper de comentarios/reacciones
 * @param {object} [options]
 * @param {number} [options.maxEdgesPerPost] tope de pares por post: un post
 *   viral con 2.000 personas genera dos millones de pares y no aporta nada
 *   sobre los primeros miles. Se toma a quienes más interactúan.
 * @returns {{contacts: object[], edges: [string, string][]}}
 */
const MAX_HISTORIAL = 8;

function contactsFromEngagement(rows, { maxEdgesPerPost = 2000, excluir, posts = [] } = {}) {
  if (!Array.isArray(rows) || rows.length === 0) return { contacts: [], edges: [] };

  const excluidos = new Set([excluir, excluir && profileKey(excluir)].filter(Boolean));
  const catalogo = catalogoPosts(posts);

  const byProfile = new Map();
  const porPost = new Map();

  for (const row of rows) {
    // El scraper devuelve posts e interacciones en el mismo dataset. Un post
    // no es una interacción de nadie con vos: es tuyo. Y trae `author`, que
    // sos vos — sin este filtro el dueño entra como nodo de su propia red.
    // Una publicación no es una interacción de nadie con vos: es tuya. El
    // repost sí lo es —alguien tomó tu post y lo puso en su feed— y por eso ya
    // no se descarta con ella. Al dueño lo saca `excluidos`, unas líneas abajo.
    const tipo = pick(row, ['type', 'itemType']).toLowerCase();
    if (tipo === 'post') continue;

    const person = personOf(row);
    // Sin perfil ni nombre no hay a quién atribuir la interacción. Crear un
    // nodo igual sería inventar una persona.
    if (!person.url && !person.name) continue;
    if (excluidos.has(person.id) || excluidos.has(person.url)) continue;

    // El id interno primero: es lo unico que empareja una reaccion con un
    // comentario de la misma persona, porque las URLs no coinciden entre tipos.
    const key = person.id || person.url || `nombre:${person.name.toLowerCase()}`;
    let contact = byProfile.get(key);
    if (!contact) {
      contact = {
        ...person,
        interactions: 0,
        comments: 0,
        reactions: 0,
        shares: 0,
        // Interactuó con una publicación tuya: te ve publicar. Eso es primer
        // grado a los efectos que importan acá, esté o no aceptada la solicitud.
        grado: 1,
        posts: new Set(),
        historial: [],
      };
      byProfile.set(key, contact);
    }

    // La primera fila puede venir sin headline y la segunda traerlo. Se
    // completa lo que falte sin pisar lo que ya está.
    contact.headline ||= person.headline;
    contact.photoUrl ||= person.photoUrl;
    // La URL sí se pisa, pero solo para cambiar un urn opaco por un slug.
    if (person.url && (!contact.url || (esUrn(contact.url) && !esUrn(person.url)))) {
      contact.url = person.url;
    }

    contact.interactions += 1;
    if (esCompartido(row)) contact.shares += 1;
    else if (isComment(row)) contact.comments += 1;
    else contact.reactions += 1;

    if (contact.historial.length < MAX_HISTORIAL) {
      contact.historial.push(eventoDe(row, catalogo));
    }

    const post = postOf(row);
    if (post) {
      contact.posts.add(post);
      if (!porPost.has(post)) porPost.set(post, new Set());
      porPost.get(post).add(key);
    }
  }

  const contacts = [...byProfile.values()]
    .map(({ posts, historial, ...contact }) => ({
      ...contact,
      postsEngaged: posts.size,
      historial,
    }))
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

/**
 * Parte el dataset de un scraper que devuelve todo junto.
 *
 * harvestapi/linkedin-profile-posts trae posts, comentarios y reacciones en el
 * mismo dataset. Sin separarlos pasan dos cosas malas: `normalizePosts` trata
 * una reacción como si fuera una publicación y ensucia las métricas de copy, y
 * se encadena una segunda llamada al actor de engagement que vuelve a cobrar
 * por datos que ya estaban en la mano.
 *
 * Una fila sin `type` se asume publicación: los scrapers que solo traen posts
 * no lo declaran, y suponer interacción inventaría personas que nadie observó.
 *
 * El repost es el caso ambiguo y hay que partirlo por autor: si lo hizo el
 * dueño, es contenido suyo y va a posts; si lo hizo otro, es alguien que agarró
 * una publicación tuya y la puso en su feed —el gesto más caro que existe— y va
 * a engagement. Sin `excluir` no se puede distinguir, así que se mantiene el
 * comportamiento conservador de tratarlo como publicación.
 */
function splitScrapedRows(rows, { excluir } = {}) {
  if (!Array.isArray(rows) || rows.length === 0) return { posts: [], engagement: [] };

  const dueno = new Set([excluir, excluir && profileKey(excluir)].filter(Boolean));
  const esDelDueno = (row) => {
    if (dueno.size === 0) return true;
    const person = personOf(row);
    if (!person.url && !person.name) return true;
    return dueno.has(person.id) || dueno.has(person.url);
  };

  const posts = [];
  const engagement = [];
  for (const row of rows) {
    const tipo = pick(row, ['type', 'itemType']).toLowerCase();
    if (tipo === 'reaction' || tipo === 'comment' || tipo === 'like') engagement.push(row);
    else if ((tipo === 'repost' || tipo === 'share') && !esDelDueno(row)) engagement.push(row);
    else posts.push(row);
  }
  return { posts, engagement };
}

/**
 * El próximo lote de gente que el front todavía no vio.
 *
 * El scraper tarda un minuto y medio y devuelve todo al final; nuestro analisis
 * tarda un segundo. Si se espera a tener todo, la pantalla esta un minuto y
 * medio en blanco. Leyendo el dataset del scraper mientras corre, las caras
 * empiezan a aparecer a los pocos segundos.
 *
 * `emitidos` se muta a proposito: es el registro de lo ya mandado y tiene que
 * sobrevivir entre vueltas del loop para no repetir a nadie.
 */
function loteNuevos(contacts, emitidos, tamano = 5) {
  const lote = [];
  for (const contact of contacts) {
    if (lote.length >= tamano) break;
    const clave = contact.url || contact.id || `nombre:${String(contact.name).toLowerCase()}`;
    if (emitidos.has(clave)) continue;
    emitidos.add(clave);
    lote.push(contact);
  }
  return { lote, restantes: contacts.length - emitidos.size };
}

/**
 * Nombre del dataset de una corrida.
 *
 * Los datasets con nombre son GLOBALES a la cuenta: `openDataset('posts')` no
 * crea uno por corrida, crea UNO y todas le escriben encima. Asi se juntaron
 * 137 publicaciones de perfiles distintos en un solo lugar mientras el backend
 * leia de otro nombre — y como `getOrCreate` crea lo que no existe, devolvia
 * vacio sin error. El dato tiene que llevar el dueño en el nombre.
 *
 * Devuelve `null` si falta el actor o la corrida: mejor que el llamador decida
 * que hacer que volver a escribir en el dataset compartido de todos.
 */
function nombreDataset(actorId, runId, sufijo) {
  if (!actorId || !runId) return null;
  return `${actorId}-${runId}-${sufijo}`;
}

/** La URL puede venir suelta o envuelta: harvestapi manda `avatar: {url}`. */
function comoUrl(value) {
  const candidato = typeof value === 'string' ? value : value?.url ?? value?.src;
  return typeof candidato === 'string' && /^https?:\/\//i.test(candidato.trim())
    ? candidato.trim()
    : null;
}

/**
 * El dueño del perfil, sacado del autor de sus propias publicaciones.
 *
 * No esta en la red porque el actor lo excluye a proposito — nadie es contacto
 * de si mismo. Pero es el autor de sus posts, y esos llegan en el PRIMER lote
 * del scraper, mucho antes de que la corrida termine. De ahi sale su foto para
 * la pantalla de espera, en vez de una inicial gris durante minuto y medio.
 */
function duenoDesdePosts(posts, perfilUrl) {
  if (!Array.isArray(posts)) return null;

  // De quien tiene que ser la cara. El scraper trae reposts, y el autor de un
  // repost NO es el dueño del perfil: sin este filtro, un perfil cuya
  // publicacion mas reciente es un repost muestra a otra persona al centro.
  const dueno = profileKey(perfilUrl ?? '').split('/in/')[1] ?? '';

  for (const post of posts) {
    const crudo = post?.raw && typeof post.raw === 'object' ? post.raw : post;
    const autor = crudo?.author;
    if (!autor?.name) continue;

    if (dueno) {
      const suyo =
        String(autor.publicIdentifier ?? '').toLowerCase() === dueno ||
        (profileKey(autor.linkedinUrl ?? '').split('/in/')[1] ?? '') === dueno;
      // Mejor ninguna cara que la equivocada.
      if (!suyo) continue;
    }

    const photoUrl = comoUrl(autor.avatar) ?? comoUrl(autor.profilePicture) ?? '';
    // Sin foto no sirve para lo que existe esta funcion: se sigue buscando en
    // el resto de las publicaciones antes de rendirse.
    if (!photoUrl) continue;

    return {
      nombre: autor.name,
      headline: autor.info ?? autor.headline ?? '',
      photoUrl,
      url: autor.publicIdentifier
        ? `https://linkedin.com/in/${autor.publicIdentifier}`
        : profileKey(autor.linkedinUrl ?? ''),
    };
  }
  return null;
}

module.exports = {
  contactsFromEngagement,
  esCompartido,
  splitScrapedRows,
  loteNuevos,
  nombreDataset,
  duenoDesdePosts,
  profileKey,
};
