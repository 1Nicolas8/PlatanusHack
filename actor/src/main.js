// El SDK v3 exporta `log` suelto: `Actor.log` no existe.
const { Actor, log } = require('apify');
const {
  normalizeConnections,
  normalizeProfile,
  buildGraph,
  analyzeOpportunity,
} = require('./network');
const { classifyHeadlines } = require('./classify');
const { planExpansion } = require('./expansion');
const { normalizePosts } = require('./posts');

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
    profileUrl,
    connectionsActorId,
    connectionsActorInput = {},
    posts = [],
    postsActorId,
    postsActorInput = {},
    profileActorId,
    profileActorInput = {},
    edges = [],
    icp,
    anthropicApiKey,
    avgSecondDegree = 500,
    expansionBudget = 50,
    maxNodes = 2000,
    seed = 'founder-1',
  } = input;

  let rows = connections;

  // Encadenado: si se configura un actor de conexiones, se lo llama y se usa su
  // dataset como entrada. Este actor no scrapea nada — orquesta y analiza. Qué
  // scraper usar y con qué credenciales es decisión de quien corre el actor.
  if (connectionsActorId) {
    const target = { ...connectionsActorInput };
    if (profileUrl) {
      // Cada scraper nombra distinto el campo del perfil: se cubren los usuales
      // sin pisar lo que el usuario haya puesto explícitamente.
      for (const field of ['profileUrl', 'profileUrls', 'startUrls', 'url']) {
        if (target[field] === undefined) {
          target[field] = field.endsWith('s') ? [profileUrl] : profileUrl;
          break;
        }
      }
    }

    log.info(`Llamando al actor de conexiones ${connectionsActorId}`);
    const run = await Actor.call(connectionsActorId, target);
    if (!run || run.status !== 'SUCCEEDED') {
      throw new Error(`El actor de conexiones terminó en ${run?.status ?? 'estado desconocido'}`);
    }

    const { items } = await Actor.apifyClient.dataset(run.defaultDatasetId).listItems();
    rows = items;
    log.info(`El actor de conexiones devolvió ${rows.length} filas`);
  }

  if (!rows.length && connectionsUrl) {
    const response = await fetch(connectionsUrl);
    if (!response.ok) throw new Error(`No se pudo leer el CSV: HTTP ${response.status}`);
    rows = parseCsv(await response.text());
  }

  if (!rows.length) {
    // El caso mas comun: llega un profileUrl pero nadie dijo QUE scraper usar
    // para resolverlo. Decirlo explicito ahorra media hora de buscar el bug.
    if (profileUrl && !connectionsActorId) {
      throw new Error(
        `Se recibio profileUrl (${profileUrl}) pero no connectionsActorId. Este actor no scrapea: ` +
          'necesita el id del actor que trae las conexiones, o el array/CSV ya cargado. ' +
          'Configura connectionsActorId con sus credenciales en connectionsActorInput.',
      );
    }
    throw new Error(
      'No hay conexiones. Pasa el array en `connections`, la URL del Connections.csv en ' +
        '`connectionsUrl`, o el id de un actor en `connectionsActorId`.',
    );
  }

  const contacts = normalizeConnections(rows, maxNodes);
  log.info(`Contactos a procesar: ${contacts.length}`);

  const { byContactId, uniqueHeadlines, llmCalls } = await classifyHeadlines({
    contacts,
    icp,
    apiKey: anthropicApiKey,
  });
  log.info(`Headlines únicos: ${uniqueHeadlines} · llamadas al modelo: ${llmCalls}`);

  const graph = buildGraph(contacts, { seed, realEdges: edges });
  const report = analyzeOpportunity({ contacts, graph, icpByContactId: byContactId, avgSecondDegree });

  await Actor.pushData(
    contacts.map((contact) => ({
      ...contact,
      ...byContactId.get(contact.id),
      degree: (graph.adjacency.get(contact.id) ?? new Set()).size,
    })),
  );

  // Plan de expansión al segundo grado: qué contactos conviene expandir con el
  // presupuesto disponible. El primer grado NO consume presupuesto — sale del
  // export. Esto solo decide dónde gastar lo que sí cuesta.
  const plan = planExpansion({
    contacts,
    icpByContactId: byContactId,
    degrees: Object.fromEntries(contacts.map((c) => [c.id, (graph.adjacency.get(c.id) ?? new Set()).size])),
    budget: expansionBudget,
  });

  // --- Publicaciones del founder ---
  // Solo extracción: se traen, se normalizan y se dejan en un dataset propio.
  // La evaluación (qué funcionó, por qué, cómo optimizar) vive en el backend.
  let postRows = posts;
  if (postsActorId) {
    const target = { ...postsActorInput };
    if (profileUrl) {
      for (const field of ['profileUrl', 'profileUrls', 'startUrls', 'url']) {
        if (target[field] === undefined) {
          target[field] = field.endsWith('s') ? [profileUrl] : profileUrl;
          break;
        }
      }
    }
    log.info(`Llamando al actor de publicaciones ${postsActorId}`);
    const run = await Actor.call(postsActorId, target);
    if (run?.status === 'SUCCEEDED') {
      const { items } = await Actor.apifyClient.dataset(run.defaultDatasetId).listItems();
      postRows = items;
      log.info(`El actor de publicaciones devolvió ${postRows.length} filas`);
    } else {
      log.warning(`El actor de publicaciones terminó en ${run?.status}. Se sigue sin ellas.`);
    }
  }

  if (postRows.length > 0) {
    const normalized = normalizePosts(postRows);
    const postsDataset = await Actor.openDataset('posts');
    await postsDataset.pushData(normalized);

    const withImpressions = normalized.filter((p) => p.metricsAvailable.impressions).length;
    log.info(
      `Publicaciones extraídas: ${normalized.length} — ${withImpressions} con impresiones. ` +
        'Sin evaluar: eso lo hace el modulo de evaluación.',
    );
  }

  // --- Perfil del founder ---
  // Es complementario a la red: si el scraper configurado falla o no devuelve
  // una ficha util, la corrida conserva sus resultados y el backend responde
  // profile: null.
  let profile = null;
  if (profileActorId) {
    try {
      const target = { ...profileActorInput };
      if (profileUrl) {
        for (const field of ['profileUrl', 'profileUrls', 'startUrls', 'url']) {
          if (target[field] === undefined) {
            target[field] = field.endsWith('s') ? [profileUrl] : profileUrl;
            break;
          }
        }
      }

      log.info(`Llamando al actor de perfil ${profileActorId}`);
      const run = await Actor.call(profileActorId, target);
      if (run?.status === 'SUCCEEDED' && run.defaultDatasetId) {
        const { items } = await Actor.apifyClient.dataset(run.defaultDatasetId).listItems();
        profile = items.map(normalizeProfile).find(Boolean) ?? null;
        log.info(`El actor de perfil devolvió ${items.length} filas`);
      } else {
        log.warning(`El actor de perfil terminó en ${run?.status ?? 'estado desconocido'}. Se sigue sin perfil.`);
      }
    } catch (error) {
      log.warning(`No se pudo extraer el perfil del founder: ${error.message}. Se sigue sin perfil.`);
    }
  }

  await Actor.setValue('OPPORTUNITY_REPORT', report);
  await Actor.setValue('EXPANSION_PLAN', plan);
  await Actor.setValue('PROFILE', profile);

  log.info(
    `Plan de expansión: ${plan.coverage.expanding} contactos sobre ${plan.coverage.clustersFound} clusters ` +
      `— cubre ${plan.coverage.icpCovered} de ${plan.coverage.icpTotal} ICP del primer grado`,
  );

  log.info(`ICP a 1 salto: ${report.icpAtOneHop} de ${report.totalContacts}`);
  log.info(`ICP estimado a 2 saltos: ${report.estimatedIcpAtTwoHops}`);
  log.info(
    `Grafo: ${graph.edges} aristas — ${graph.realEdges} reales, ${graph.modeledEdges} modeladas ` +
      `(${(graph.realRatio * 100).toFixed(0)}% observado)`,
  );
  log.info(report.verdict);
});
