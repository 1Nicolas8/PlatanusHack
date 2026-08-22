// El SDK v3 exporta `log` suelto: `Actor.log` no existe.
const { Actor, log } = require('apify');
const {
  normalizeConnections,
  buildGraph,
  analyzeOpportunity,
} = require('./network');
const { classifyHeadlines } = require('./classify');
const { planExpansion } = require('./expansion');
const { normalizePosts } = require('./posts');
const { contactsFromEngagement } = require('./engagement');

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
    // Fuente pública: quién comentó y reaccionó en los posts del perfil. No
    // necesita sesión de LinkedIn — los comentarios de un post público se ven
    // deslogueado. Es la alternativa a ceder la cookie `li_at`.
    engagement = [],
    engagementActorId,
    engagementActorInput = {},
    // Relectura de una corrida anterior. Scrapear el mismo perfil dos veces
    // cuesta lo mismo la segunda vez y devuelve casi lo mismo, asi que para
    // iterar sobre el analisis — que es donde se pasa el tiempo — se relee el
    // dataset ya pagado. Leerlo vale del orden de un millonesimo de dolar.
    engagementDatasetId,
    edges = [],
    icp,
    anthropicApiKey,
    avgSecondDegree = 500,
    expansionBudget = 50,
    maxNodes = 2000,
    seed = 'founder-1',
  } = input;

  /** Cada scraper nombra distinto el campo del perfil. Se cubren los usuales. */
  const conPerfil = (base, url) => {
    const target = { ...base };
    if (!url) return target;
    for (const field of ['profileUrl', 'profileUrls', 'startUrls', 'url']) {
      if (target[field] === undefined) {
        target[field] = field.endsWith('s') ? [url] : url;
        break;
      }
    }
    return target;
  };

  /** Llama a un actor encadenado y devuelve su dataset. */
  const encadenar = async (actorId, target, etiqueta, { obligatorio = true } = {}) => {
    log.info(`Llamando al actor de ${etiqueta} ${actorId}`);
    const run = await Actor.call(actorId, target);
    if (!run || run.status !== 'SUCCEEDED') {
      const detalle = `El actor de ${etiqueta} terminó en ${run?.status ?? 'estado desconocido'}`;
      if (obligatorio) throw new Error(detalle);
      log.warning(`${detalle}. Se sigue sin eso.`);
      return [];
    }
    const { items } = await Actor.apifyClient.dataset(run.defaultDatasetId).listItems();
    log.info(`El actor de ${etiqueta} devolvió ${items.length} filas`);
    return items;
  };

  // --- Publicaciones ---
  // Van primero porque de acá salen las URLs cuyo engagement es la fuente
  // pública de la red. Sin posts no hay a quién mirarle los comentarios.
  let postRows = posts;
  if (postsActorId) {
    postRows = await encadenar(
      postsActorId,
      conPerfil(postsActorInput, profileUrl),
      'publicaciones',
      { obligatorio: false },
    );
  }

  let rows = connections;
  let realEdges = edges;

  // Fuente 1 — el export oficial o un array ya cargado. Dato del propio
  // usuario: no se scrapea nada y no hace falta credencial de nadie.
  if (!rows.length && connectionsUrl) {
    const response = await fetch(connectionsUrl);
    if (!response.ok) throw new Error(`No se pudo leer el CSV: HTTP ${response.status}`);
    rows = parseCsv(await response.text());
  }

  // Fuente 2 — el engagement público de los posts. NO necesita sesión: los
  // comentarios de un post público se ven deslogueado. Es la red de quien te
  // lee de verdad, que para decidir a quién cultivar es mejor señal que una
  // lista de conexiones aceptadas hace años.
  if (!rows.length) {
    let engagementRows = engagement;

    // Antes de gastar: si hay una corrida anterior del mismo perfil, se relee.
    if (!engagementRows.length && engagementDatasetId) {
      const { items } = await Actor.apifyClient.dataset(engagementDatasetId).listItems();
      engagementRows = items;
      log.info(`Releyendo ${items.length} filas de ${engagementDatasetId} — sin scrapear, sin costo.`);
    }

    if (!engagementRows.length && engagementActorId) {
      const urls = postRows.map((p) => p.url ?? p.postUrl ?? p.link).filter(Boolean);
      if (!urls.length) {
        log.warning('No hay URLs de posts: el actor de engagement no tiene qué mirar.');
      } else {
        engagementRows = await encadenar(
          engagementActorId,
          { ...engagementActorInput, postUrls: urls, startUrls: urls },
          'engagement',
          { obligatorio: false },
        );
      }
    }

    if (engagementRows.length) {
      // El dueño del perfil no es contacto de su propia red.
      const derivada = contactsFromEngagement(engagementRows, { excluir: profileUrl });
      rows = derivada.contacts;
      // Aristas observadas, no modeladas: co-audiencia en un mismo post.
      if (!realEdges.length) realEdges = derivada.edges;
      log.info(
        `Red desde engagement público: ${rows.length} personas, ${realEdges.length} aristas observadas ` +
          '— sin cookie de sesión.',
      );
    }
  }

  // Fuente 3 — un scraper de conexiones. Es el único camino que exige la
  // cookie `li_at` de una cuenta real, así que queda último y es opt-in.
  if (!rows.length && connectionsActorId) {
    rows = await encadenar(
      connectionsActorId,
      conPerfil(connectionsActorInput, profileUrl),
      'conexiones',
    );
  }

  if (!rows.length) {
    throw new Error(
      'No hay red que analizar. Hay tres formas de traerla, en orden de preferencia: ' +
        '(1) `connections` o `connectionsUrl` con tu export oficial de LinkedIn; ' +
        '(2) `engagementActorId` junto a `postsActorId`, que arma la red desde quién ' +
        'comenta tus posts públicos y no necesita sesión; ' +
        '(3) `connectionsActorId`, que sí exige la cookie de una cuenta real.',
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

  const graph = buildGraph(contacts, { seed, realEdges });
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
  // Ya se extrajeron arriba, porque el engagement depende de ellas. Acá solo se
  // normalizan y se dejan en un dataset propio: la evaluación (qué funcionó,
  // por qué, cómo optimizar) vive en el backend.
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

  await Actor.setValue('OPPORTUNITY_REPORT', report);
  await Actor.setValue('EXPANSION_PLAN', plan);

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
