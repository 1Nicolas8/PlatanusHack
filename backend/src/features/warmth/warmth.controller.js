const repository = require('./warmth.repository');
const { computeWarmth } = require('./warmth.service');
const { rankByReach } = require('./reach.service');
const { buildNetworkMap } = require('./warmth.map');
const AppError = require('../../shared/errors/AppError');
const { normalizeProfileUrl } = require('../../shared/utils/profileKey');
const { planEnrichment } = require('./enrichment.service');
const { recommendWhoToCultivate } = require('./recommend.service');

/** El mapa completo de la red en una sola llamada. */
async function getMap(req, res) {
  if (!req.query.perfil) {
    throw AppError.badRequest(
      'Falta el parámetro perfil. El mapa siempre se pide para un perfil: sin él, mostraríamos la red de otra persona.',
    );
  }
  const perfil = normalizeProfileUrl(req.query.perfil);

  const [connections, reactions, posts] = await Promise.all([
    repository.loadConnections(perfil),
    repository.loadReactions(perfil),
    repository.loadPosts(perfil),
  ]);

  // Nada cargado para este perfil no es una red vacia: es que todavia no se
  // extrajo. Devolver el mapa de otro seria mentir.
  if (connections.length === 0) {
    return res.status(404).json({
      error: 'Todavia no hay datos para este perfil.',
      perfil,
      hint: 'Corre la extraccion o carga el Connections.csv de este perfil.',
    });
  }

  const warmth = computeWarmth({ connections, reactions, posts });
  const reach = rankByReach({ connections, reactions });

  const map = buildNetworkMap({ warmth, reach, posts });
  // El plan de enriquecimiento viaja con el mapa: quien lo dibuja tambien
  // necesita saber a quien conviene profundizar.
  const enrichment = planEnrichment({
    nodes: map.nodes,
    budget: Number(req.query.enrichmentBudget) || undefined,
  });

  const cultivate = recommendWhoToCultivate({ nodes: map.nodes });

  return res.json({ data: { perfil, ...map, enrichment, cultivate } });
}

module.exports = { getMap };
