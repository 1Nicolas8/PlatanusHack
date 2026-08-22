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
