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

/**
 * Dispara la extracción y vuelve enseguida con el id de la corrida.
 *
 * No espera a que termine a propósito: el actor tarda minutos y en serverless
 * la función se corta antes. El cliente pregunta por el estado después.
 */
async function startExtraction({ profileUrl, icp, connectionsActorId, connectionsActorInput, postsActorId, postsActorInput }) {
  const run = await getClient()
    .actor(env.APIFY_ACTOR_ID)
    .start({
      profileUrl,
      icp,
      anthropicApiKey: env.ANTHROPIC_API_KEY,
      ...(connectionsActorId ? { connectionsActorId, connectionsActorInput } : {}),
      ...(postsActorId ? { postsActorId, postsActorInput } : {}),
    });

  return { runId: run.id, status: run.status, startedAt: run.startedAt };
}

async function getRun(runId) {
  const run = await getClient().run(runId).get();
  if (!run) throw AppError.notFound(`Corrida ${runId} no encontrada en Apify`);
  return run;
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

module.exports = { startExtraction, getRun, fetchContacts, fetchPosts };
