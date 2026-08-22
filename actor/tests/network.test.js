const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeConnections } = require('../src/network');

test('el export oficial de LinkedIn entra con sus nombres de columna', () => {
  const [contacto] = normalizeConnections(
    [{ 'First Name': 'Ana', 'Last Name': 'Perez', Company: 'Acme', Position: 'CTO' }],
    10,
  );

  assert.equal(contacto.name, 'Ana Perez');
  assert.equal(contacto.headline, 'CTO at Acme');
});

test('la interacción medida sobrevive a la normalización', () => {
  // Cuando la red viene del engagement público, `interactions` es el único
  // dato de temperatura que hay — y es real, no estimado. Si se pierde acá,
  // el mapa de calor vuelve a ser un modelo y toda la ventaja se evapora.
  const [contacto] = normalizeConnections(
    [
      {
        name: 'Ana Perez',
        headline: 'CTO en Acme',
        url: 'https://linkedin.com/in/anaperez',
        interactions: 4,
        comments: 3,
        reactions: 1,
        postsEngaged: 2,
      },
    ],
    10,
  );

  assert.equal(contacto.interactions, 4);
  assert.equal(contacto.comments, 3);
  assert.equal(contacto.reactions, 1);
  assert.equal(contacto.postsEngaged, 2);
});

test('un contacto sin engagement no finge tenerlo', () => {
  // Cero interacciones y "no sabemos" no son lo mismo. Un contacto del export
  // nunca fue medido: ponerle 0 lo haría parecer frío cuando es desconocido.
  const [contacto] = normalizeConnections([{ 'First Name': 'Ana', Company: 'Acme' }], 10);

  assert.equal(contacto.interactions, null);
  assert.equal(contacto.postsEngaged, null);
});
