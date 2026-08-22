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
