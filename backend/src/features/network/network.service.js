const client = require('./network.client');
const repository = require('./network.repository');
const { pickOwnerPhoto } = require('./ownerPhoto');
const logger = require('../../shared/logger/logger');
const AppError = require('../../shared/errors/AppError');
const { normalizeProfileUrl } = require('../../shared/utils/profileKey');
const perfilesService = require('../perfiles/perfiles.service');

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

  // Mientras corre, lo que ya se reconoció. El scraper tarda ~90s y devuelve
  // todo al final, pero el actor va emitiendo personas de a lotes: así el front
  // muestra caras a los pocos segundos en vez de esperar con la pantalla vacía.
  if (run.status !== 'SUCCEEDED') {
    // Solo mientras está viva: una corrida ya terminada mal no va a emitir nada
    // nuevo, y pedirle progreso es una llamada al vacío en cada poll.
    if (base.finished) return base;

    // El progreso es cosmético. try/catch y no `.catch()` encadenado: si la
    // lectura falla de forma sincrónica el encadenado no la agarra. Esto no
    // puede tumbar el polling de una corrida que se está pagando.
    let filas = [];
    try {
      filas = (await client.fetchProgress(run)) ?? [];
    } catch (error) {
      // Se loguea y no se traga: este catch escondio un 404 por un nombre de
      // dataset mal armado, y el sintoma era "progreso vacio" — indistinguible
      // de "la corrida todavia no emitio nada". Un error que no deja rastro
      // cuesta mas que el que rompe.
      logger.warn({ runId, error: error.message }, 'no se pudo leer el progreso');
    }

    // El dueño viaja por la misma cola, marcado con `tipo`. Se separa porque no
    // es un contacto: es de quien es la red, y el front lo dibuja al centro.
    // Dejarlo entre las caras lo mostraria como parte de su propia audiencia.
    const dueno = filas.find((fila) => fila?.tipo === 'dueno') ?? null;
    const progreso = filas.filter((fila) => fila?.tipo !== 'dueno');

    return { ...base, progreso, dueno };
  }

  const [contacts, posts, input] = await Promise.all([
    client.fetchContacts(run),
    client.fetchPosts(run),
    client.fetchRunInput(run),
  ]);

  const summary = {
    contacts: contacts.length,
    posts: posts.length,
    icpContacts: contacts.filter((c) => c.isIcp).length,
    ...averagePostMetrics(posts),
  };

  if (!persist) return { ...base, summary, persisted: false };

  // Sin saber de quien es la red no se escribe. Guardar sin dueño es lo que
  // hacia que todos vieran los contactos de la misma persona.
  if (!input?.profileUrl) {
    throw AppError.badRequest(
      `La corrida ${runId} no registra el perfil de origen, así que no se puede saber de quién ` +
        'es esta red. No se persiste nada.',
    );
  }
  const perfilUrl = normalizeProfileUrl(input.profileUrl);

  const [connectionResult, postsWritten] = await Promise.all([
    repository.saveConnections(perfilUrl, contacts),
    repository.savePosts(perfilUrl, posts),
  ]);
  const reactionsWritten = await repository.saveReactions(perfilUrl, {
    matches: connectionResult.matches,
  });
  const { profilesWritten, profilesMatched } = await perfilesService.ingestActorAudience({
    perfilUrl,
    runId,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    contactsTotal: contacts.length,
    matches: connectionResult.matches,
    ownerFotoUrl: pickOwnerPhoto(posts, perfilUrl),
  });

  logger.info(
    {
      runId,
      perfilUrl,
      connectionsWritten: connectionResult.written,
      profilesWritten,
      profilesMatched,
      postsWritten,
      reactionsWritten,
    },
    'extracción persistida',
  );

  return {
    ...base,
    perfilUrl,
    summary,
    persisted: true,
    written: {
      connections: connectionResult.written,
      profiles: profilesWritten,
      profilesMatched,
      posts: postsWritten,
      reactions: reactionsWritten,
    },
  };
}

/**
 * Promedio sobre posts CON métrica, no sobre los que no la trajeron.
 *
 * harvestapi anida likes/comments en `engagement`; normalizePosts los deja
 * planos. Un post sin número no es un post con cero — mezclarlos ensucia el
 * promedio.
 */
function averagePostMetrics(posts) {
  const conMetrica = (posts ?? []).filter((p) => typeof p.reactions === 'number');
  if (conMetrica.length === 0) {
    return { promedioReacciones: null, promedioComentarios: null, postsConMetrica: 0 };
  }
  return {
    postsConMetrica: conMetrica.length,
    promedioReacciones:
      conMetrica.reduce((suma, p) => suma + p.reactions, 0) / conMetrica.length,
    promedioComentarios:
      conMetrica.reduce((suma, p) => suma + (p.comments ?? 0), 0) / conMetrica.length,
  };
}

module.exports = { startRun, getRunStatus, averagePostMetrics };
