const test = require('node:test');
const assert = require('node:assert/strict');

const { contactsFromEngagement } = require('../src/engagement');

/**
 * Cada scraper de engagement nombra los campos distinto. El módulo tiene que
 * tragarse las tres o cuatro formas usuales sin que nadie configure un mapeo.
 */
const filas = [
  {
    postUrl: 'https://linkedin.com/posts/nico_uno',
    authorName: 'Ana Perez',
    authorHeadline: 'CTO en Acme',
    authorProfileUrl: 'https://www.linkedin.com/in/anaperez/',
    commentText: 'Buenísimo esto',
  },
  {
    postUrl: 'https://linkedin.com/posts/nico_uno',
    name: 'Bryan Alx',
    headline: 'Founder · Platanus',
    profileUrl: 'https://linkedin.com/in/alxbryann',
    reactionType: 'LIKE',
  },
  {
    postUrl: 'https://linkedin.com/posts/nico_dos',
    fullName: 'Ana Perez',
    occupation: 'CTO en Acme',
    profileUrl: 'https://www.linkedin.com/in/anaperez',
    reactionType: 'PRAISE',
  },
];

test('una persona por perfil, no una por interacción', () => {
  const { contacts } = contactsFromEngagement(filas);

  assert.equal(contacts.length, 2);
  assert.deepEqual(
    contacts.map((c) => c.name).sort(),
    ['Ana Perez', 'Bryan Alx'],
  );
});

test('la temperatura es el conteo real de interacciones, no una estimación', () => {
  const { contacts } = contactsFromEngagement(filas);
  const ana = contacts.find((c) => c.name === 'Ana Perez');

  assert.equal(ana.interactions, 2);
  assert.equal(ana.comments, 1);
  assert.equal(ana.reactions, 1);
  assert.equal(ana.postsEngaged, 2);
});

test('la misma persona con URL distinta en cada scraper es una sola', () => {
  // Una fila trae la URL con barra final y www, la otra no. Si no se
  // normaliza, Ana entra dos veces y su temperatura queda partida al medio.
  const { contacts } = contactsFromEngagement(filas);
  assert.equal(contacts.filter((c) => c.name === 'Ana Perez').length, 1);
});

test('quien interactuó con el mismo post comparte audiencia', () => {
  const { edges } = contactsFromEngagement(filas);

  assert.equal(edges.length, 1);
  assert.deepEqual(edges[0].sort(), [
    'https://linkedin.com/in/alxbryann',
    'https://linkedin.com/in/anaperez',
  ]);
});

test('sale con la forma que normalizeConnections ya sabe leer', () => {
  const { contacts } = contactsFromEngagement(filas);
  const ana = contacts.find((c) => c.name === 'Ana Perez');

  assert.equal(ana.headline, 'CTO en Acme');
  assert.equal(ana.url, 'https://linkedin.com/in/anaperez');
});

test('una fila sin persona identificable se descarta en vez de inventar un nodo', () => {
  const { contacts } = contactsFromEngagement([
    ...filas,
    { postUrl: 'https://linkedin.com/posts/nico_uno', reactionType: 'LIKE' },
  ]);

  assert.equal(contacts.length, 2);
});

test('sin filas no explota: devuelve vacío', () => {
  assert.deepEqual(contactsFromEngagement([]), { contacts: [], edges: [] });
  assert.deepEqual(contactsFromEngagement(undefined), { contacts: [], edges: [] });
});

test('el tope de aristas por post evita que un post viral haga explotar el grafo', () => {
  const virales = Array.from({ length: 60 }, (_, i) => ({
    postUrl: 'https://linkedin.com/posts/viral',
    name: `Persona ${i}`,
    profileUrl: `https://linkedin.com/in/persona-${i}`,
    reactionType: 'LIKE',
  }));

  const { edges } = contactsFromEngagement(virales, { maxEdgesPerPost: 100 });
  assert.equal(edges.length, 100);
});

/**
 * Forma real de harvestapi/linkedin-profile-posts, el scraper sin cookie que
 * usamos como fuente. Dos diferencias con los genericos, medidas contra un
 * dataset de verdad y no supuestas:
 *
 *   1. la persona viene anidada en `actor`, no en la raiz
 *   2. la URL cambia de forma segun el tipo: la reaccion trae el urn opaco
 *      (/in/ACoAA...) y el comentario el slug legible. El mismo humano
 *      apareceria dos veces. `actor.id` si es estable entre ambos.
 */
const harvest = [
  {
    type: 'reaction',
    reactionType: 'LIKE',
    postId: 'urn:li:ugcPost:748',
    actor: {
      id: 'ACoAAE06ZtwB',
      name: 'Bryan Riaño',
      linkedinUrl: 'https://www.linkedin.com/in/ACoAAE06ZtwB',
      position: 'AI & Systems Engineer',
      pictureUrl: 'https://media.licdn.com/foto.jpg',
    },
  },
  {
    type: 'comment',
    commentary: 'grande',
    postId: 'urn:li:ugcPost:748',
    actor: {
      id: 'ACoAAE06ZtwB',
      name: 'Bryan Riaño',
      linkedinUrl: 'https://www.linkedin.com/in/bryan-alexander-riano-romero',
      position: 'AI & Systems Engineer',
    },
  },
];

test('lee la persona anidada en actor', () => {
  const { contacts } = contactsFromEngagement(harvest);
  assert.equal(contacts[0].name, 'Bryan Riaño');
  assert.equal(contacts[0].headline, 'AI & Systems Engineer');
  assert.equal(contacts[0].photoUrl, 'https://media.licdn.com/foto.jpg');
});

test('el mismo humano con urn y con slug es una sola persona', () => {
  const { contacts } = contactsFromEngagement(harvest);

  assert.equal(contacts.length, 1);
  assert.equal(contacts[0].interactions, 2);
  assert.equal(contacts[0].comments, 1);
  assert.equal(contacts[0].reactions, 1);
});

test('gana la URL legible sobre el urn opaco', () => {
  // El urn no sirve para nada humano: no se puede abrir ni reconocer. Si hay
  // slug disponible en cualquiera de las filas, es el que tiene que quedar.
  const { contacts } = contactsFromEngagement(harvest);
  assert.equal(contacts[0].url, 'https://linkedin.com/in/bryan-alexander-riano-romero');
});

test('el historial dice a qué post reaccionó, cuándo y con qué tipo', () => {
  const { contacts } = contactsFromEngagement(harvest, {
    posts: [{
      id: 'urn:li:ugcPost:748',
      content: 'We won the first GTM Hackathon in LATAM.',
      postedAt: { date: '2026-05-31T17:32:33.577Z' },
    }],
  });
  const bryan = contacts[0];
  assert.equal(bryan.historial.length, 2);
  assert.equal(bryan.historial[0].tipo, 'like');
  assert.equal(bryan.historial[0].subtipo, 'like');
  assert.equal(bryan.historial[0].hook, 'We won the first GTM Hackathon in LATAM.');
  assert.equal(bryan.historial[0].fecha, '2026-05-31T17:32:33.577Z');
  assert.equal(bryan.historial[1].tipo, 'comentario');
  assert.equal(bryan.historial[1].comentario, 'grande');
});

test('PRAISE es celebración, EMPATHY es amor — el porqué observable del like', () => {
  const { contacts } = contactsFromEngagement([
    {
      type: 'reaction',
      reactionType: 'PRAISE',
      postId: '7466904468123705344',
      actor: { id: 'A', name: 'Ana' },
    },
    {
      type: 'reaction',
      reactionType: 'EMPATHY',
      postId: '7466904468123705344',
      actor: { id: 'A', name: 'Ana' },
    },
  ], {
    posts: [{ id: '7466904468123705344', content: 'ganamos', postedAt: { date: '2026-05-31T00:00:00.000Z' } }],
  });

  assert.deepEqual(contacts[0].historial.map((e) => e.subtipo), ['celebrate', 'love']);
  assert.equal(contacts[0].historial[0].hook, 'ganamos');
});

test('el tipo declarado manda sobre adivinar por campos', () => {
  // Una reaccion no tiene texto, pero un comentario vacio tampoco. Con `type`
  // presente no hay que inferir nada.
  const { contacts } = contactsFromEngagement([
    { type: 'comment', commentary: '', postId: 'p1', actor: { id: 'X', name: 'Ana' } },
  ]);
  assert.equal(contacts[0].comments, 1);
  assert.equal(contacts[0].reactions, 0);
});

test('el id de la interaccion no se confunde con el de la persona', () => {
  // Trampa real de harvestapi: la fila trae un `id` propio — el urn de LA
  // REACCION, unico por interaccion. Tomarlo como identidad de la persona
  // hace que nadie dedupee nunca y que todo el mundo quede en 1 interaccion:
  // el mapa de calor sale plano, y no parece un bug — parece que nadie te lee.
  const { contacts } = contactsFromEngagement([
    {
      type: 'reaction',
      id: 'urn:li:fsd_reaction:(urn:li:fsd_profile:ACoAAX,urn:li:ugcPost:1,0)',
      postId: 'p1',
      actor: { id: 'ACoAAX', name: 'Alejandra Correa', position: 'Systems Engineer' },
    },
    {
      type: 'reaction',
      id: 'urn:li:fsd_reaction:(urn:li:fsd_profile:ACoAAX,urn:li:ugcPost:2,0)',
      postId: 'p2',
      actor: { id: 'ACoAAX', name: 'Alejandra Correa', position: 'Systems Engineer' },
    },
  ]);

  assert.equal(contacts.length, 1);
  assert.equal(contacts[0].interactions, 2);
  assert.equal(contacts[0].postsEngaged, 2);
});

test('replay: las filas cacheadas dan el mismo resultado que el scrapeo', () => {
  // La garantia que hace barato probar: releer un dataset guardado tiene que
  // producir exactamente el mismo grafo que la corrida que lo genero. Si no,
  // testear gratis daria numeros distintos a los del demo y no serviria.
  const filas = [
    { type: 'reaction', id: 'r1', postId: 'p1', actor: { id: 'A', name: 'Ana' } },
    { type: 'comment', id: 'c1', postId: 'p1', actor: { id: 'B', name: 'Bryan' } },
    { type: 'reaction', id: 'r2', postId: 'p2', actor: { id: 'A', name: 'Ana' } },
  ];

  const primera = contactsFromEngagement(filas);
  const replay = contactsFromEngagement(JSON.parse(JSON.stringify(filas)));

  assert.deepEqual(replay, primera);
});

test('un post no es una interaccion: el dueño no entra a su propio grafo', () => {
  // El scraper devuelve posts e interacciones en el MISMO dataset. Un post
  // trae `author`, que es el dueño del perfil — tomarlo como contacto lo mete
  // como nodo de su propia red, con una interaccion consigo mismo.
  const { contacts } = contactsFromEngagement([
    { type: 'post', id: 'p1', author: { id: 'DUENO', name: 'Juan Nicolas Torrente' } },
    { type: 'reaction', id: 'r1', postId: 'p1', actor: { id: 'A', name: 'Ana' } },
  ]);

  assert.equal(contacts.length, 1);
  assert.equal(contacts[0].name, 'Ana');
});

test('se puede excluir explicitamente al dueño del perfil', () => {
  const { contacts } = contactsFromEngagement(
    [
      { type: 'reaction', id: 'r1', postId: 'p1', actor: { id: 'DUENO', name: 'Juan Nicolas' } },
      { type: 'reaction', id: 'r2', postId: 'p1', actor: { id: 'A', name: 'Ana' } },
    ],
    { excluir: 'DUENO' },
  );

  assert.equal(contacts.length, 1);
  assert.equal(contacts[0].name, 'Ana');
});

const { splitScrapedRows } = require('../src/engagement');

test('un solo dataset se parte en publicaciones e interacciones', () => {
  // harvestapi/linkedin-profile-posts devuelve posts, comentarios y reacciones
  // JUNTOS. Si no se parte pasan dos cosas malas: normalizePosts trata una
  // reaccion como si fuera un post, y se encadena una segunda llamada al actor
  // de engagement que vuelve a cobrar por datos que ya estaban en la mano.
  const { posts, engagement } = splitScrapedRows([
    { type: 'post', id: 'p1', content: 'hola' },
    { type: 'reaction', id: 'r1', postId: 'p1', actor: { id: 'A', name: 'Ana' } },
    { type: 'comment', id: 'c1', postId: 'p1', actor: { id: 'B', name: 'Bryan' } },
  ]);

  assert.equal(posts.length, 1);
  assert.equal(engagement.length, 2);
  assert.equal(posts[0].id, 'p1');
});

test('un scraper que solo devuelve posts no inventa interacciones', () => {
  const { posts, engagement } = splitScrapedRows([
    { text: 'un post sin campo type', url: 'https://linkedin.com/posts/x' },
  ]);

  assert.equal(posts.length, 1);
  assert.equal(engagement.length, 0);
});

test('sin filas no explota', () => {
  assert.deepEqual(splitScrapedRows([]), { posts: [], engagement: [] });
  assert.deepEqual(splitScrapedRows(undefined), { posts: [], engagement: [] });
});

const { loteNuevos } = require('../src/engagement');

test('solo se emite gente que el front todavia no vio', () => {
  const emitidos = new Set(['https://linkedin.com/in/ana']);
  const contacts = [
    { url: 'https://linkedin.com/in/ana', name: 'Ana' },
    { url: 'https://linkedin.com/in/bryan', name: 'Bryan' },
  ];

  const { lote } = loteNuevos(contacts, emitidos, 5);

  assert.equal(lote.length, 1);
  assert.equal(lote[0].name, 'Bryan');
});

test('emite de a lotes del tamaño pedido, no de a uno ni todo junto', () => {
  const contacts = Array.from({ length: 12 }, (_, i) => ({
    url: `https://linkedin.com/in/p${i}`,
    name: `P${i}`,
  }));

  const { lote } = loteNuevos(contacts, new Set(), 5);
  assert.equal(lote.length, 5);
});

test('marca lo emitido para que la proxima vuelta no lo repita', () => {
  const contacts = Array.from({ length: 7 }, (_, i) => ({
    url: `https://linkedin.com/in/p${i}`,
    name: `P${i}`,
  }));

  const emitidos = new Set();
  const primera = loteNuevos(contacts, emitidos, 5);
  assert.equal(primera.lote.length, 5);
  assert.equal(emitidos.size, 5);

  const segunda = loteNuevos(contacts, emitidos, 5);
  assert.equal(segunda.lote.length, 2);
  assert.equal(emitidos.size, 7);

  const tercera = loteNuevos(contacts, emitidos, 5);
  assert.equal(tercera.lote.length, 0);
});

test('sin foto igual se emite: el nodo existe aunque no tenga cara', () => {
  const { lote } = loteNuevos([{ url: 'https://linkedin.com/in/x', name: 'X' }], new Set(), 5);
  assert.equal(lote.length, 1);
});

test('un contacto sin url se identifica por nombre y no se duplica', () => {
  const emitidos = new Set();
  loteNuevos([{ name: 'Sin Url' }], emitidos, 5);
  const otra = loteNuevos([{ name: 'Sin Url' }], emitidos, 5);
  assert.equal(otra.lote.length, 0);
});

const { duenoDesdePosts } = require('../src/engagement');

/**
 * El dueño del perfil no esta en la red: el actor lo excluye a proposito. Pero
 * SI es el autor de sus propias publicaciones, y esas llegan en el primer lote
 * del scraper — mucho antes de que termine la corrida. De ahi sale su foto para
 * la pantalla de espera, en vez de una inicial gris durante minuto y medio.
 */
test('saca al dueño del autor de sus publicaciones', () => {
  const dueno = duenoDesdePosts([
    {
      type: 'post',
      author: {
        name: 'Juan Nicolas Torrente Heredia',
        info: 'Ingeniero de sistemas | GTM Hackathon LATAM Winner',
        publicIdentifier: 'juan-nicolas-torrente',
        avatar: { url: 'https://media.licdn.com/foto.jpg', width: 800 },
      },
    },
  ]);

  assert.equal(dueno.nombre, 'Juan Nicolas Torrente Heredia');
  assert.equal(dueno.photoUrl, 'https://media.licdn.com/foto.jpg');
  assert.match(dueno.headline, /Ingeniero/);
  assert.equal(dueno.url, 'https://linkedin.com/in/juan-nicolas-torrente');
});

test('sin publicaciones no inventa un dueño', () => {
  assert.equal(duenoDesdePosts([]), null);
  assert.equal(duenoDesdePosts(undefined), null);
});

test('una publicacion sin autor no cuenta', () => {
  assert.equal(duenoDesdePosts([{ type: 'post', content: 'hola' }]), null);
});

test('si el primer post no trae foto, sigue buscando', () => {
  const dueno = duenoDesdePosts([
    { author: { name: 'Juan' } },
    { author: { name: 'Juan', avatar: { url: 'https://media.licdn.com/2.jpg' } } },
  ]);

  assert.equal(dueno.photoUrl, 'https://media.licdn.com/2.jpg');
});

test('un repost ajeno es un compartido de esa persona, no una publicacion tuya', () => {
  const { contacts } = contactsFromEngagement(
    [
      { type: 'repost', postId: 7, actor: { id: 'p1', name: 'Ana', linkedinUrl: 'https://linkedin.com/in/ana' } },
      { type: 'reaction', postId: 7, reactionType: 'LIKE', actor: { id: 'p2', name: 'Beto', linkedinUrl: 'https://linkedin.com/in/beto' } },
    ],
    { excluir: 'https://linkedin.com/in/dueno', posts: [{ id: 7, content: 'Como pusimos precio' }] },
  );

  const ana = contacts.find((c) => c.name === 'Ana');
  assert.equal(ana.shares, 1);
  assert.equal(ana.interactions, 1);
  assert.equal(ana.historial[0].tipo, 'compartir');
  assert.equal(ana.historial[0].hook, 'Como pusimos precio');
});

test('quien interactua con un post tuyo queda marcado como primer grado', () => {
  const { contacts } = contactsFromEngagement(
    [{ type: 'reaction', postId: 1, actor: { id: 'p1', name: 'Ana', linkedinUrl: 'https://linkedin.com/in/ana' } }],
    { excluir: 'https://linkedin.com/in/dueno' },
  );

  assert.equal(contacts[0].grado, 1);
});

test('el repost del dueño sigue siendo contenido suyo, no engagement', () => {
  const filas = [
    { type: 'repost', id: 'r1', author: { name: 'Dueño', linkedinUrl: 'https://linkedin.com/in/dueno' } },
    { type: 'repost', id: 'r2', author: { name: 'Ana', linkedinUrl: 'https://linkedin.com/in/ana' } },
  ];

  const { posts, engagement } = splitScrapedRows(filas, { excluir: 'https://linkedin.com/in/dueno' });

  assert.equal(posts.length, 1);
  assert.equal(engagement.length, 1);
  assert.equal(engagement[0].id, 'r2');
});

test('sin saber quien es el dueño, un repost se trata como publicacion', () => {
  const { posts, engagement } = splitScrapedRows([{ type: 'repost', id: 'r1' }]);

  assert.equal(posts.length, 1);
  assert.equal(engagement.length, 0);
});
