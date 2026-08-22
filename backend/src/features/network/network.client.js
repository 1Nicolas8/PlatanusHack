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

/** El scraper configurado por entorno; el llamado explicito lo puede sobreescribir. */
function defaultConnectionsActor() {
  if (!env.APIFY_CONNECTIONS_ACTOR_ID) return {};
  let input = {};
  try {
    input = env.APIFY_CONNECTIONS_ACTOR_INPUT ? JSON.parse(env.APIFY_CONNECTIONS_ACTOR_INPUT) : {};
  } catch {
    throw AppError.badRequest('APIFY_CONNECTIONS_ACTOR_INPUT no es JSON valido');
  }
  return { connectionsActorId: env.APIFY_CONNECTIONS_ACTOR_ID, connectionsActorInput: input };
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
function assertConnectionsSourceConfigured({ profileUrl, connectionsActorId, connectionsActorInput }) {
  if (!profileUrl) return;

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

async function startExtraction({ profileUrl, icp, connectionsActorId, connectionsActorInput, postsActorId, postsActorInput }) {
  const fallback = defaultConnectionsActor();
  assertConnectionsSourceConfigured({ profileUrl, connectionsActorId, connectionsActorInput });
  const run = await getClient()
    .actor(env.APIFY_ACTOR_ID)
    .start({
      profileUrl,
      icp,
      anthropicApiKey: env.ANTHROPIC_API_KEY,
      ...(connectionsActorId ? { connectionsActorId, connectionsActorInput } : fallback),
      ...(postsActorId ? { postsActorId, postsActorInput } : {}),
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
