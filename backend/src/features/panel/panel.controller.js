const { randomUUID } = require('node:crypto');
const repository = require('./panel.repository');
const service = require('./panel.service');
const backtest = require('./panel.backtest');
const AppError = require('../../shared/errors/AppError');
const logger = require('../../shared/logger/logger');
const { normalizeProfileUrl } = require('../../shared/utils/profileKey');

/** Evalúa un copy contra el panel y deja la corrida trazada. */
async function evaluar(req, res) {
  const perfilUrl = normalizeProfileUrl(req.body.perfil);
  const { copy, icp, panel, rondas, iteraciones, semilla } = req.body;

  // Los posts van junto a la red: de ellos salen las métricas reales que anclan
  // la simulación y la evidencia de qué publicaciones dejó pasar cada contacto.
  const [candidates, posts] = await Promise.all([
    repository.loadPanelCandidates(perfilUrl),
    repository.loadProfilePosts(perfilUrl),
  ]);
  if (candidates.length === 0) {
    throw AppError.notFound(
      `No hay red cargada para ${perfilUrl}. Corré la extracción antes de evaluar un copy.`,
    );
  }

  const corridaId = randomUUID();
  const resultado = await service.evaluateCopy({
    copy,
    candidates,
    posts,
    icp,
    panelSize: panel,
    rondas,
    iteraciones,
    seed: semilla ?? perfilUrl,
  });

  // La trazabilidad no puede costar la respuesta: si la escritura falla, el
  // veredicto ya está calculado y devolverlo sigue siendo lo correcto — pero
  // el cliente tiene que enterarse de que esta corrida no quedó guardada.
  let trazada = true;
  try {
    await repository.saveRun({ corridaId, perfilUrl, copy, icp, resultado });
  } catch (error) {
    trazada = false;
    logger.error({ err: error.message, corridaId }, 'no se pudo trazar la corrida del panel');
  }

  // Los turnos crudos no viajan en la respuesta de la evaluación: son cientos
  // de prompts. Quedan guardados y se piden por GET cuando alguien quiere
  // auditar una corrida.
  const publico = { ...resultado };
  delete publico.turnos;

  res.status(201).json({
    data: {
      corridaId,
      perfil: perfilUrl,
      trazada,
      // Vuelve el copy evaluado: la UI muestra el prompt exacto que leyó cada
      // agente, y el copy es una de sus piezas.
      copy,
      ...publico,
    },
  });
}

/**
 * Corre el motor contra una publicación ya publicada y devuelve la brecha.
 *
 * Es lo que permite decir si la simulación quedó cerca sin depender de la
 * impresión de nadie: el post ya tiene sus reacciones reales cargadas.
 */
async function correrBacktest(req, res) {
  const perfilUrl = normalizeProfileUrl(req.body.perfil);
  const [candidates, posts] = await Promise.all([
    repository.loadPanelCandidates(perfilUrl),
    repository.loadProfilePosts(perfilUrl),
  ]);
  if (candidates.length === 0) {
    throw AppError.notFound(
      `No hay red cargada para ${perfilUrl}. Corré la extracción antes de contrastar la simulación.`,
    );
  }

  const resultado = await backtest.backtestPost({
    candidates,
    posts,
    orden: req.body.orden,
    panelSize: req.body.panel,
    semilla: req.body.semilla,
    icp: req.body.icp,
  });

  res.json({ data: { perfil: perfilUrl, ...resultado } });
}

/** Una corrida con todos sus turnos: qué pasó en cada ronda de cada iteración. */
async function getCorrida(req, res) {
  const corrida = await repository.findRun(req.params.corridaId);
  if (!corrida) throw AppError.notFound(`No existe la corrida ${req.params.corridaId}.`);

  const turnos = await repository.listTurns(corrida.id);

  res.json({
    data: {
      corridaId: corrida.id,
      perfil: corrida.perfil_url,
      copy: corrida.copy,
      icp: corrida.icp,
      configuracion: {
        panel: corrida.panel,
        rondas: corrida.rondas,
        iteraciones: corrida.iteraciones,
        modelo: corrida.modelo,
        semilla: corrida.semilla,
      },
      score: corrida.score === null ? null : Number(corrida.score),
      dispersion: corrida.desviacion === null ? null : Number(corrida.desviacion),
      convergio: corrida.convergio,
      veredicto: corrida.veredicto,
      mejoras: corrida.mejoras,
      ...corrida.resumen,
      creadaEn: corrida.created_at,
      turnos: turnos.map((t) => ({
        iteracion: t.iteracion,
        ronda: t.ronda,
        conexionId: t.conexion_id === null ? null : String(t.conexion_id),
        nombre: t.nombre,
        headline: t.headline,
        accion: t.accion,
        score: t.score,
        objecion: t.objecion,
        comentario: t.comentario,
        razon: t.razon,
        vio: t.vio,
        prompt: t.prompt,
        respuesta: t.respuesta,
      })),
    },
  });
}

/** Las corridas anteriores de un perfil, para ver cómo evolucionó el copy. */
async function getHistorial(req, res) {
  const perfilUrl = normalizeProfileUrl(req.query.perfil);
  const corridas = await repository.listRuns({ perfilUrl, limit: req.query.limite });

  res.json({
    data: {
      perfil: perfilUrl,
      corridas: corridas.map((c) => ({
        corridaId: c.id,
        copy: c.copy,
        score: c.score === null ? null : Number(c.score),
        dispersion: c.desviacion === null ? null : Number(c.desviacion),
        convergio: c.convergio,
        veredicto: c.veredicto,
        configuracion: { panel: c.panel, rondas: c.rondas, iteraciones: c.iteraciones },
        creadaEn: c.created_at,
      })),
    },
  });
}

module.exports = { evaluar, correrBacktest, getCorrida, getHistorial };
