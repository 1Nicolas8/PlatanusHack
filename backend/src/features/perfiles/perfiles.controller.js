const repository = require('./perfiles.repository');
const { resolverPerfiles } = require('./perfiles.service');
const { normalizeProfileUrl } = require('../../shared/utils/profileKey');
const AppError = require('../../shared/errors/AppError');
const logger = require('../../shared/logger/logger');

/** Carga el enriquecimiento que devolvió el scrapeo de perfiles. */
async function ingest(req, res) {
  const perfilUrl = normalizeProfileUrl(req.body.perfil);
  const conexiones = await repository.loadConnectionIndex(perfilUrl);

  if (conexiones.length === 0) {
    throw AppError.conflict(
      `No hay conexiones cargadas para ${perfilUrl}. Primero corré la extracción de la red: ` +
        'sin ella no hay a quién pegarle estos perfiles.',
    );
  }

  const { filas, resueltos, sinResolver, ambiguos } = resolverPerfiles({
    perfiles: req.body.perfiles,
    conexiones,
  });
  const escritas = await repository.saveProfiles(filas);

  logger.info({ perfilUrl, escritas, sinResolver: sinResolver.length }, 'perfiles enriquecidos cargados');

  res.status(201).json({
    data: {
      perfil: perfilUrl,
      escritos: escritas,
      resueltos: resueltos.length,
      // Lo que no se pudo pegar viaja en la respuesta: quien llama tiene que
      // poder ver que su scrapeo trajo gente que no está en la red cargada.
      sinResolver,
      ambiguos,
      cobertura: await repository.coverage(perfilUrl),
    },
  });
}

/** Cuánto de la red está enriquecida — lo que decide si el panel vale algo. */
async function getCoverage(req, res) {
  const perfilUrl = normalizeProfileUrl(req.query.perfil);
  res.json({ data: { perfil: perfilUrl, ...(await repository.coverage(perfilUrl)) } });
}

module.exports = { ingest, getCoverage };
