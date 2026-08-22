const { ApifyClient } = require('apify-client');
const env = require('../../config/env');
const AppError = require('../../shared/errors/AppError');

/**
 * Única puerta de entrada a Apify.
 *
 * Si mañana se cambia de proveedor de extracción, solo se toca este archivo:
 * ni el service ni el controller saben que Apify existe.
 */

let client = null;

function getClient() {
  if (!env.APIFY_TOKEN) {
    throw AppError.badRequest('APIFY_TOKEN no está configurado: no se puede extraer la red.');
  }
  if (!client) client = new ApifyClient({ token: env.APIFY_TOKEN });
  return client;
}

function parseActorInput(raw, nombreVariable) {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw AppError.badRequest(`${nombreVariable} no es JSON valido`);
  }
}

/** El scraper configurado por entorno; el llamado explicito lo puede sobreescribir. */
function defaultConnectionsActor() {
  if (!env.APIFY_CONNECTIONS_ACTOR_ID) return {};
  return {
    connectionsActorId: env.APIFY_CONNECTIONS_ACTOR_ID,
    connectionsActorInput: parseActorInput(
      env.APIFY_CONNECTIONS_ACTOR_INPUT,
      'APIFY_CONNECTIONS_ACTOR_INPUT',
    ),
  };
}

/**
 * La fuente pública, por entorno. Va en pareja: el actor de posts trae las
 * publicaciones y el de engagement mira quién comentó en ellas. Ninguno de los
 * dos necesita la cookie de sesión de una cuenta.
 */
function defaultPublicSource() {
  const engagementActorId = env.APIFY_ENGAGEMENT_ACTOR_ID;
  if (!engagementActorId) return {};
  return {
    engagementActorId,
    engagementActorInput: parseActorInput(
      env.APIFY_ENGAGEMENT_ACTOR_INPUT,
      'APIFY_ENGAGEMENT_ACTOR_INPUT',
    ),
    ...(env.APIFY_POSTS_ACTOR_ID
      ? {
          postsActorId: env.APIFY_POSTS_ACTOR_ID,
          postsActorInput: parseActorInput(env.APIFY_POSTS_ACTOR_INPUT, 'APIFY_POSTS_ACTOR_INPUT'),
        }
      : {}),
  };
}

/**
 * Dispara la extracción y vuelve enseguida con el id de la corrida.
 *
 * No espera a que termine a propósito: el actor tarda minutos y en serverless
 * la función se corta antes. El cliente pregunta por el estado después.
 */
/**
 * Chequeo previo: sin fuente de conexiones la corrida va a fallar sí o sí.
 *
 * Detectarlo acá y no dejar que Apify lo descubra evita quemar una corrida —
 * que cuesta plata real — y le devuelve al usuario un error inmediato en vez
 * de tenerlo esperando el polling de una corrida condenada.
 */
function assertConnectionsSourceConfigured({
  profileUrl,
  connections,
  connectionsUrl,
  connectionsActorId,
  connectionsActorInput,
  postsActorId,
  engagementActorId,
}) {
  if (!profileUrl) return;

  // Red propia ya cargada: no hay nada que scrapear, así que no hay sesión que
  // pedir. Es el camino del export oficial de LinkedIn, que es dato del propio
  // usuario y no requiere credencial de nadie.
  if (connections?.length > 0 || connectionsUrl) return;

  // Fuente pública: los comentarios de un post público se ven deslogueado, así
  // que esta vía no necesita cookie de nadie. Pero el engagement cuelga de los
  // posts: sin actor que los traiga, el de engagement no tiene qué mirar y la
  // corrida termina vacía habiendo cobrado igual.
  if (engagementActorId ?? env.APIFY_ENGAGEMENT_ACTOR_ID) {
    if (postsActorId ?? env.APIFY_POSTS_ACTOR_ID) return;
    throw AppError.badRequest(
      'Hay actor de engagement pero no de publicaciones. La red pública se arma desde quién ' +
        'comenta tus posts, así que sin APIFY_POSTS_ACTOR_ID no hay posts a los que mirarles ' +
        'los comentarios.',
    );
  }

  const actorId = connectionsActorId ?? env.APIFY_CONNECTIONS_ACTOR_ID;
  if (!actorId) {
    throw AppError.badRequest(
      'No hay un actor de conexiones configurado. Para resolver un perfil hace falta ' +
        'APIFY_CONNECTIONS_ACTOR_ID, o pasar las conexiones ya cargadas.',
    );
  }

  const input = connectionsActorInput ?? defaultConnectionsActor().connectionsActorInput ?? {};
  // El scraper de LinkedIn no puede ver nada sin sesion: sin cookie la corrida
  // termina en invalid-input y se paga igual.
  if (Object.keys(input).length === 0) {
    throw AppError.badRequest(
      `El actor de conexiones (${actorId}) esta configurado pero sin credenciales. ` +
        'Carga APIFY_CONNECTIONS_ACTOR_INPUT con la sesion que ese scraper pide. ' +
        'Sin eso la corrida falla y se cobra igual.',
    );
  }
}

/**
 * Elige UNA fuente de red y solo una.
 *
 * El orden no es arbitrario: primero el dato que ya es del usuario, después el
 * que es público, y último el que exige entregar la cookie de sesión de una
 * cuenta real. Mandar dos fuentes juntas es peor que mandar una mal — el actor
 * prioriza el scraper encadenado, así que se descartaría el dato bueno y se
 * pagaría una corrida por el privilegio.
 */
function resolveSource({
  connections,
  connectionsUrl,
  connectionsActorId,
  connectionsActorInput,
  postsActorId,
  postsActorInput,
  engagementActorId,
  engagementActorInput,
}) {
  if (connections?.length > 0 || connectionsUrl) {
    return {
      ...(connections?.length ? { connections } : {}),
      ...(connectionsUrl ? { connectionsUrl } : {}),
    };
  }

  const publica = engagementActorId
    ? {
        engagementActorId,
        engagementActorInput,
        ...(postsActorId ? { postsActorId, postsActorInput } : {}),
      }
    : defaultPublicSource();
  if (publica.engagementActorId) return publica;

  return connectionsActorId
    ? { connectionsActorId, connectionsActorInput }
    : defaultConnectionsActor();
}

/**
 * Relee una corrida ya pagada.
 *
 * Vive en el backend y no en el actor por una razón dura: un actor corre bajo
 * LIMITED_PERMISSIONS y su token solo alcanza sus propios storages, así que
 * leer un dataset ajeno desde adentro devuelve 403 siempre. El token de cuenta
 * lo tiene este backend.
 */
async function fetchEngagementDataset(datasetId) {
  const { items } = await getClient().dataset(datasetId).listItems();

  // Un id vencido sigue siendo válido y devuelve vacío. Si eso pasara al actor,
  // la corrida terminaría en error tres minutos después, ya cobrada.
  if (!items.length) {
    throw AppError.badRequest(
      `El dataset ${datasetId} vino vacío: o no existe, o vencio. El plan gratuito de Apify ` +
        'retiene los datasets 7 dias. Volve a correr la extraccion.',
    );
  }
  return items;
}

async function startExtraction({
  profileUrl,
  icp,
  connections,
  connectionsUrl,
  connectionsActorId,
  connectionsActorInput,
  postsActorId,
  postsActorInput,
  engagementActorId,
  engagementActorInput,
  engagementDatasetId,
}) {
  // La relectura sale antes que cualquier otra fuente: es la unica gratis.
  const engagement = engagementDatasetId
    ? await fetchEngagementDataset(engagementDatasetId)
    : undefined;

  if (engagement) {
    const run = await getClient()
      .actor(env.APIFY_ACTOR_ID)
      .start({ profileUrl, icp, anthropicApiKey: env.ANTHROPIC_API_KEY, engagement });
    return { runId: run.id, status: run.status, startedAt: run.startedAt };
  }

  assertConnectionsSourceConfigured({
    profileUrl,
    connections,
    connectionsUrl,
    connectionsActorId,
    connectionsActorInput,
    postsActorId,
    engagementActorId,
  });

  const fuente = resolveSource({
    connections,
    connectionsUrl,
    connectionsActorId,
    connectionsActorInput,
    postsActorId,
    postsActorInput,
    engagementActorId,
    engagementActorInput,
  });

  const run = await getClient()
    .actor(env.APIFY_ACTOR_ID)
    .start({
      profileUrl,
      icp,
      anthropicApiKey: env.ANTHROPIC_API_KEY,
      ...fuente,
      // Los posts se piden igual aunque la red venga de otro lado: el módulo de
      // evaluación de copy los necesita.
      ...(postsActorId && !fuente.postsActorId ? { postsActorId, postsActorInput } : {}),
    });

  return { runId: run.id, status: run.status, startedAt: run.startedAt };
}

async function getRun(runId) {
  const run = await getClient().run(runId).get();
  if (!run) throw AppError.notFound(`Corrida ${runId} no encontrada en Apify`);
  return run;
}

/**
 * El input con el que se lanzo la corrida.
 *
 * Es la unica fuente honesta de a que perfil pertenecen estos datos: lo dice la
 * corrida que efectivamente se ejecuto, no un parametro que el cliente puede
 * cambiar despues.
 */
async function fetchRunInput(run) {
  if (!run.defaultKeyValueStoreId) return null;
  const record = await getClient().keyValueStore(run.defaultKeyValueStoreId).getRecord('INPUT');
  return record?.value ?? null;
}

/** Contactos: viven en el dataset por defecto de la corrida. */
async function fetchContacts(run) {
  if (!run.defaultDatasetId) return [];
  const { items } = await getClient().dataset(run.defaultDatasetId).listItems();
  return items;
}

/**
 * Publicaciones: el actor las deja en un dataset con nombre propio para no
 * mezclarlas con los contactos. Si no hubo posts, el dataset no existe y eso
 * no es un error.
 */
async function fetchPosts(run) {
  const name = `${run.actId}-${run.id}-posts`;
  try {
    const dataset = await getClient().datasets().getOrCreate(name);
    const { items } = await getClient().dataset(dataset.id).listItems();
    return items;
  } catch {
    return [];
  }
}

module.exports = { startExtraction, getRun, fetchRunInput, fetchContacts, fetchPosts };
