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

const { buildGraph } = require('../src/network');

test('una arista repetida se cuenta una vez, no una por aparicion', () => {
  // Dos personas que coinciden en varios posts generan el mismo par muchas
  // veces. La adyacencia es un Set y la deduplica, pero el contador no lo
  // hacia: el reporte terminaba diciendo "130% observado", que es imposible
  // y delata que el numero no significaba lo que decia significar.
  const contacts = normalizeConnections(
    [
      { name: 'Ana', url: 'https://linkedin.com/in/ana' },
      { name: 'Bryan', url: 'https://linkedin.com/in/bryan' },
    ],
    10,
  );

  const graph = buildGraph(contacts, {
    seed: 'x',
    realEdges: [
      ['https://linkedin.com/in/ana', 'https://linkedin.com/in/bryan'],
      ['https://linkedin.com/in/bryan', 'https://linkedin.com/in/ana'],
      ['https://linkedin.com/in/ana', 'https://linkedin.com/in/bryan'],
    ],
  });

  assert.equal(graph.edges, 1);
  assert.equal(graph.realEdges, 1);
  assert.equal(graph.realRatio, 1);
});

test('realRatio nunca puede pasar de 1', () => {
  const contacts = normalizeConnections(
    Array.from({ length: 5 }, (_, i) => ({ name: `P${i}`, url: `https://linkedin.com/in/p${i}` })),
    10,
  );

  const realEdges = [];
  for (let repeticion = 0; repeticion < 4; repeticion += 1) {
    for (let i = 0; i < 5; i += 1) {
      for (let j = i + 1; j < 5; j += 1) {
        realEdges.push([`https://linkedin.com/in/p${i}`, `https://linkedin.com/in/p${j}`]);
      }
    }
  }

  const graph = buildGraph(contacts, { seed: 'x', realEdges });
  assert.ok(graph.realRatio <= 1, `realRatio fue ${graph.realRatio}`);
  assert.equal(graph.modeledEdges, 0);
});

const { analyzeOpportunity } = require('../src/network');

const contactosDe = (n) =>
  normalizeConnections(
    Array.from({ length: n }, (_, i) => ({ name: `P${i}`, url: `https://linkedin.com/in/p${i}` })),
    100,
  );

test('sin clasificar a nadie, el veredicto no afirma que no hay compradores', () => {
  // "0 de 171 son ICP" cuando nadie fue evaluado NO significa que tu red no
  // tenga compradores: significa que no se midio. Presentarlo como medicion es
  // el mismo pecado que el realRatio de 130% — un numero que no significa lo
  // que dice significar, y este ademas se muestra en el demo.
  const contacts = contactosDe(10);
  const graph = buildGraph(contacts, { seed: 'x', realEdges: [] });

  const report = analyzeOpportunity({
    contacts,
    graph,
    icpByContactId: new Map(contacts.map((c) => [c.id, { isIcp: false }])),
    avgSecondDegree: 500,
    icpEvaluado: false,
  });

  assert.match(report.verdict, /no se clasific|sin ICP|no se evalu/i);
  assert.equal(report.icpAtOneHop, null);
  assert.equal(report.icpRatio, null);
});

test('con clasificacion real, el veredicto sigue siendo el de siempre', () => {
  const contacts = contactosDe(10);
  const graph = buildGraph(contacts, { seed: 'x', realEdges: [] });

  const report = analyzeOpportunity({
    contacts,
    graph,
    icpByContactId: new Map(contacts.map((c, i) => [c.id, { isIcp: i < 3 }])),
    avgSecondDegree: 500,
    icpEvaluado: true,
  });

  assert.equal(report.icpAtOneHop, 3);
  assert.match(report.verdict, /suficiente/i);
});
