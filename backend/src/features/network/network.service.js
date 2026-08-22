const client = require('./network.client');
const repository = require('./network.repository');
const logger = require('../../shared/logger/logger');

/**
 * Orquesta la extracción de una red desde un perfil.
 *
 * El flujo es en dos tiempos porque el actor tarda minutos y una función
 * serverless no puede esperarlo:
 *
 *   POST /runs        dispara y devuelve el runId
 *   GET  /runs/:id    consulta estado; cuando terminó, persiste y resume
 *
 * El cliente hace polling. No es elegante, pero es lo que soporta el runtime.
 */

const TERMINAL = new Set(['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT']);

async function startRun(input) {
  const run = await client.startExtraction(input);
  logger.info({ runId: run.runId, profileUrl: input.profileUrl }, 'extracción iniciada');
  return run;
}

/**
 * Consulta el estado y, si terminó bien, persiste los datos.
 *
 * `persist: false` permite mirar el resultado sin escribir, que es lo que se
 * quiere mientras se prueba: una corrida mala no debería ensuciar las tablas
 * que el equipo cargó a mano.
 */
async function getRunStatus(runId, { persist = true } = {}) {
  const run = await client.getRun(runId);

  const base = {
    runId,
    status: run.status,
    finished: TERMINAL.has(run.status),
    startedAt: run.startedAt,
    finishedAt: run.finishedAt ?? null,
  };

  if (run.status !== 'SUCCEEDED') return base;

  const [contacts, posts] = await Promise.all([client.fetchContacts(run), client.fetchPosts(run)]);

  const summary = {
    contacts: contacts.length,
    posts: posts.length,
    icpContacts: contacts.filter((c) => c.isIcp).length,
  };

  if (!persist) return { ...base, summary, persisted: false };

  const [connectionsWritten, postsWritten] = await Promise.all([
    repository.saveConnections(contacts),
    repository.savePosts(posts),
  ]);

  logger.info({ runId, connectionsWritten, postsWritten }, 'extracción persistida');

  return {
    ...base,
    summary,
    persisted: true,
    written: { connections: connectionsWritten, posts: postsWritten },
  };
}

module.exports = { startRun, getRunStatus };
