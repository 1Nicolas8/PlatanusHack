// El SDK v3 exporta `log` suelto: `Actor.log` no existe.
const { Actor, log } = require('apify');
const {
  normalizeConnections,
  buildGraph,
  analyzeOpportunity,
} = require('./network');
const { classifyHeadlines } = require('./classify');
const { planExpansion } = require('./expansion');
const { normalizePosts, pickPostUrl, summarizePostMetrics } = require('./posts');
const {
  contactsFromEngagement,
  splitScrapedRows,
  loteNuevos,
  nombreDataset,
  duenoDesdePosts,
} = require('./engagement');

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
    // Como se llama el campo del perfil en cada scraper. Adivinarlo falla en
    // silencio: harvestapi usa `targetUrls` y con `profileUrl` devuelve cero.
    profileField,
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

  /**
   * Pone la URL del perfil en el campo que ese scraper espera.
   *
   * Adivinar el nombre del campo es fragil y falla en silencio: harvestapi usa
   * `targetUrls`, se le mandaba `profileUrl`, lo ignoraba y devolvia cero filas
   * sin decir por que. Por eso quien elige el actor puede declarar el campo en
   * `profileField`; la lista de abajo es solo el ultimo recurso.
   */
  const conPerfil = (base, url, profileField) => {
    const target = { ...base };
    if (!url) return target;

    if (profileField) {
      if (target[profileField] === undefined) {
        target[profileField] = profileField.endsWith('s') ? [url] : url;
      }
      return target;
    }

    for (const field of ['targetUrls', 'profileUrl', 'profileUrls', 'startUrls', 'url']) {
      if (target[field] === undefined) {
        target[field] = field.endsWith('s') ? [url] : url;
        break;
      }
    }
    return target;
  };

  /** Llama a un actor encadenado y devuelve su dataset. */
  const encadenar = async (actorId, target, etiqueta, { obligatorio = true, alLlegar } = {}) => {
    log.info(`Llamando al actor de ${etiqueta} ${actorId}`);

    // `start` y no `call`: call bloquea hasta que el hijo termina, y ahi se va
    // el 95% del tiempo de pared. Arrancandolo y leyendo su dataset mientras
    // corre, el front puede ir mostrando caras a los pocos segundos en vez de
    // esperar el minuto y medio completo con la pantalla en blanco.
    const arrancada = await Actor.start(actorId, target);
    const cliente = Actor.apifyClient.run(arrancada.id);

    const TERMINAL = new Set(['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT']);
    const acumuladas = [];
    let offset = 0;
    let estado = arrancada.status;

    for (;;) {
      const info = await cliente.get();
      estado = info?.status ?? 'FAILED';

      if (info?.defaultDatasetId) {
        const { items } = await Actor.apifyClient
          .dataset(info.defaultDatasetId)
          .listItems({ offset });
        if (items.length) {
          offset += items.length;
          acumuladas.push(...items);
          // El aviso de progreso no puede tumbar la corrida: si falla, se
          // pierde la animacion, no los datos.
          if (alLlegar) {
            try {
              await alLlegar(acumuladas);
            } catch (error) {
              log.warning(`No se pudo emitir progreso: ${error.message}`);
            }
          }
        }
      }

      if (TERMINAL.has(estado)) break;
      await new Promise((resolver) => setTimeout(resolver, 3000));
    }

    if (estado !== 'SUCCEEDED') {
      const detalle = `El actor de ${etiqueta} terminó en ${estado}`;
      if (obligatorio) throw new Error(detalle);
      log.warning(`${detalle}. Se sigue sin eso.`);
      return [];
    }

    log.info(`El actor de ${etiqueta} devolvió ${acumuladas.length} filas`);
    return acumuladas;
  };

  // --- Publicaciones ---
  // Van primero porque de acá salen las URLs cuyo engagement es la fuente
  // pública de la red. Sin posts no hay a quién mirarle los comentarios.
  let postRows = posts;
  // El mismo dataset puede traer posts, comentarios y reacciones. Lo que no sea
  // publicacion se guarda: es engagement ya pagado, y volver a pedirlo al actor
  // de engagement seria pagar dos veces por el mismo dato.
  let engagementDelScrape = [];
  // Feed de progreso: dataset propio donde van saliendo las personas apenas se
  // las reconoce, de a lotes. Va separado del dataset final a proposito — el
  // final es la verdad con los conteos completos, este es para que la pantalla
  // no este un minuto y medio en blanco. Mezclarlos daria conteos a medio
  // cocinar presentados como definitivos.
  // Con el nombre de la corrida adentro: un dataset con nombre es global a la
  // cuenta, asi que sin esto todos los perfiles escriben en el mismo lugar.
  const { actorId, actorRunId } = Actor.getEnv();
  const nombreProgreso = nombreDataset(actorId, actorRunId, 'progreso');
  const progreso = nombreProgreso ? await Actor.openDataset(nombreProgreso) : null;
  if (!progreso) log.warning('Sin datos de la corrida: no se emite progreso.');
  const emitidos = new Set();
  // Comun a las dos fuentes que pueden alimentar progreso: arma el lote de a 5
  // y lo empuja. Comparte `emitidos` con ambas para no repetir a nadie aunque
  // una corrida real solo usa una fuente por vez.
  const emitirLote = async (contacts) => {
    if (!progreso) return;
    const { lote } = loteNuevos(contacts, emitidos, 5);
    if (!lote.length) return;

    await progreso.pushData(
      lote.map((c) => ({
        nombre: c.name,
        headline: c.headline,
        url: c.url,
        photoUrl: c.photoUrl,
        interactions: c.interactions,
        // Parcial a proposito: cuantas van reconocidas, no cuantas hay. El
        // total real no se sabe hasta que el scraper termina.
        reconocidosHastaAhora: emitidos.size,
      })),
    );
    log.info(`Progreso: ${emitidos.size} personas reconocidas`);
  };
  // El dueño sale una sola vez, en cuanto aparece su primera publicacion. Va
  // marcado con `tipo` para que el backend lo separe de la gente de la red:
  // no es un contacto, es de quien es la red.
  let duenoEmitido = false;
  const emitirDueno = async (posts) => {
    if (duenoEmitido || !progreso) return;
    const dueno = duenoDesdePosts(posts);
    if (!dueno) return;

    duenoEmitido = true;
    await progreso.pushData([{ ...dueno, tipo: 'dueno' }]);
    log.info(`Dueño reconocido: ${dueno.nombre}`);
  };

  const emitirProgreso = async (crudasHastaAhora) => {
    const { posts: parcialPosts, engagement: parcial } = splitScrapedRows(crudasHastaAhora);
    // Antes que la gente: las publicaciones llegan primero y con ellas la cara
    // del dueño, que es la que da contexto a toda la pantalla de espera.
    await emitirDueno(parcialPosts);
    if (!parcial.length) return;
    const { contacts } = contactsFromEngagement(parcial, {
      excluir: profileUrl,
      posts: parcialPosts,
    });
    await emitirLote(contacts);
  };
  // Fuente 3 trae la foto de perfil real de cada contacto sin depender de que
  // el dueño tenga publicaciones — a diferencia de Fuente 2, que necesita
  // posts con comentarios para tener a quien mostrar. Misma cola de progreso.
  const emitirProgresoConexiones = async (crudasHastaAhora) => {
    await emitirLote(normalizeConnections(crudasHastaAhora, maxNodes));
  };

  if (postsActorId) {
    const crudas = await encadenar(
      postsActorId,
      conPerfil(postsActorInput, profileUrl, profileField),
      'publicaciones',
      { obligatorio: false, alLlegar: emitirProgreso },
    );
    const partido = splitScrapedRows(crudas);
    postRows = partido.posts;
    engagementDelScrape = partido.engagement;
    if (engagementDelScrape.length) {
      log.info(
        `El scraper devolvio ${postRows.length} publicaciones y ${engagementDelScrape.length} ` +
          'interacciones en el mismo dataset: no hace falta encadenar el actor de engagement.',
      );
    }
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
    let engagementRows = engagement.length ? engagement : engagementDelScrape;

    // Antes de gastar: si hay una corrida anterior del mismo perfil, se relee.
    //
    // Ojo: un actor corre bajo LIMITED_PERMISSIONS y su token solo alcanza sus
    // propios storages, asi que leer un dataset de la cuenta desde aca devuelve
    // 403. Se intenta igual porque el actor puede estar configurado con
    // permisos completos, pero el camino que siempre funciona es que quien
    // tiene el token de cuenta — el backend — lea las filas y las mande en
    // `engagement`.
    if (!engagementRows.length && engagementDatasetId) {
      try {
        const { items } = await Actor.apifyClient.dataset(engagementDatasetId).listItems();
        engagementRows = items;
        log.info(`Releyendo ${items.length} filas de ${engagementDatasetId} — sin scrapear, sin costo.`);
      } catch (error) {
        throw new Error(
          `No se pudo leer el dataset ${engagementDatasetId} (${error.message}). ` +
            'Un actor solo ve sus propios storages: para releer una corrida anterior, ' +
            'que el backend lea las filas con el token de cuenta y las pase en `engagement`.',
        );
      }
    }

    if (!engagementRows.length && engagementActorId) {
      const urls = postRows.map(pickPostUrl).filter(Boolean);
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
      const derivada = contactsFromEngagement(engagementRows, {
        excluir: profileUrl,
        posts: postRows,
      });
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
      { alLlegar: emitirProgresoConexiones },
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
  // Sin ICP o sin API key no se clasifico a nadie. El reporte tiene que saberlo
  // para no presentar "0 ICP" como una medicion.
  const icpEvaluado = Boolean(icp && anthropicApiKey && llmCalls > 0);
  const report = analyzeOpportunity({
    contacts,
    graph,
    icpByContactId: byContactId,
    avgSecondDegree,
    icpEvaluado,
  });

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
    const nombrePosts = nombreDataset(actorId, actorRunId, 'posts');
    const postsDataset = await Actor.openDataset(nombrePosts ?? undefined);
    await postsDataset.pushData(normalized);

    const resumen = summarizePostMetrics(normalized);
    await Actor.setValue('POST_METRICS', resumen);

    const withImpressions = normalized.filter((p) => p.metricsAvailable.impressions).length;
    const promedio =
      resumen.promedioReacciones === null
        ? 'sin métrica de reacciones'
        : `promedio ${resumen.promedioReacciones.toFixed(1)} reacciones ` +
          `(${resumen.conMetrica} de ${resumen.posts} con métrica)`;
    log.info(
      `Publicaciones extraídas: ${normalized.length} — ${promedio}. ` +
        `${withImpressions} con impresiones (sin cookie no vienen). ` +
        'Sin evaluar: eso lo hace el modulo de evaluación.',
    );
  }

  await Actor.setValue('OPPORTUNITY_REPORT', report);
  await Actor.setValue('EXPANSION_PLAN', plan);

  log.info(
    `Plan de expansión: ${plan.coverage.expanding} contactos sobre ${plan.coverage.clustersFound} clusters ` +
      `— cubre ${plan.coverage.icpCovered} de ${plan.coverage.icpTotal} ICP del primer grado`,
  );

  if (report.icpEvaluado) {
    log.info(`ICP a 1 salto: ${report.icpAtOneHop} de ${report.totalContacts}`);
    log.info(`ICP estimado a 2 saltos: ${report.estimatedIcpAtTwoHops}`);
  } else {
    log.info(`ICP: no clasificado en esta corrida (${report.totalContacts} contactos sin evaluar).`);
  }
  log.info(
    `Grafo: ${graph.edges} aristas — ${graph.realEdges} reales, ${graph.modeledEdges} modeladas ` +
      `(${(graph.realRatio * 100).toFixed(0)}% observado)`,
  );
  log.info(report.verdict);
});
