const { Actor } = require('apify');
const {
  normalizeConnections,
  buildGraph,
  analyzeOpportunity,
} = require('./network');
const { classifyHeadlines } = require('./classify');

/** Parser de CSV mínimo: soporta comillas y comas dentro de campo. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (char !== '\r') field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }

  // El export de LinkedIn trae unas líneas de aviso antes del encabezado real.
  const headerIndex = rows.findIndex((r) => r.some((c) => /first name|url|company/i.test(c)));
  if (headerIndex === -1) return [];

  const header = rows[headerIndex].map((h) => h.trim());
  return rows
    .slice(headerIndex + 1)
    .filter((r) => r.length === header.length && r.some((c) => c.trim()))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i].trim()])));
}

Actor.main(async () => {
  const input = (await Actor.getInput()) ?? {};
  const {
    connections = [],
    connectionsUrl,
    edges = [],
    icp,
    anthropicApiKey,
    avgSecondDegree = 500,
    maxNodes = 2000,
    seed = 'founder-1',
  } = input;

  if (!icp) throw new Error('Falta el ICP: sin él no se puede clasificar nada.');

  let rows = connections;
  if (connectionsUrl) {
    const response = await fetch(connectionsUrl);
    if (!response.ok) throw new Error(`No se pudo leer el CSV: HTTP ${response.status}`);
    rows = parseCsv(await response.text());
  }

  if (!rows.length) {
    throw new Error(
      'No hay conexiones. Pegá el array o pasá la URL del Connections.csv del export de LinkedIn.',
    );
  }

  const contacts = normalizeConnections(rows, maxNodes);
  Actor.log.info(`Contactos a procesar: ${contacts.length}`);

  const { byContactId, uniqueHeadlines, llmCalls } = await classifyHeadlines({
    contacts,
    icp,
    apiKey: anthropicApiKey,
  });
  Actor.log.info(`Headlines únicos: ${uniqueHeadlines} · llamadas al modelo: ${llmCalls}`);

  const graph = buildGraph(contacts, { seed, realEdges: edges });
  const report = analyzeOpportunity({ contacts, graph, icpByContactId: byContactId, avgSecondDegree });

  await Actor.pushData(
    contacts.map((contact) => ({
      ...contact,
      ...byContactId.get(contact.id),
      degree: (graph.adjacency.get(contact.id) ?? new Set()).size,
    })),
  );

  await Actor.setValue('OPPORTUNITY_REPORT', report);

  Actor.log.info(`ICP a 1 salto: ${report.icpAtOneHop} de ${report.totalContacts}`);
  Actor.log.info(`ICP estimado a 2 saltos: ${report.estimatedIcpAtTwoHops}`);
  Actor.log.info(
    `Grafo: ${graph.edges} aristas — ${graph.realEdges} reales, ${graph.modeledEdges} modeladas ` +
      `(${(graph.realRatio * 100).toFixed(0)}% observado)`,
  );
  Actor.log.info(report.verdict);
});
