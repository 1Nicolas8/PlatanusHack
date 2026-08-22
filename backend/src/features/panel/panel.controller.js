const { randomUUID } = require('node:crypto');
const repository = require('./panel.repository');
const service = require('./panel.service');
const AppError = require('../../shared/errors/AppError');
const logger = require('../../shared/logger/logger');
const { normalizeProfileUrl } = require('../../shared/utils/profileKey');

/** Evalúa un copy contra el panel y deja la corrida trazada. */
async function evaluar(req, res) {
  const perfilUrl = normalizeProfileUrl(req.body.perfil);
  const { copy, icp, panel, rondas, iteraciones, semilla } = req.body;

  const candidates = await repository.loadPanelCandidates(perfilUrl);
  if (candidates.length === 0) {
    throw AppError.notFound(
      `No hay red cargada para ${perfilUrl}. Corré la extracción antes de evaluar un copy.`,
    );
  }

  const corridaId = randomUUID();
  const resultado = await service.evaluateCopy({
    copy,
    candidates,
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
      ...publico,
    },
  });
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

module.exports = { evaluar, getCorrida, getHistorial };
