const repository = require('./warmth.repository');
const { computeWarmth } = require('./warmth.service');
const { rankByReach } = require('./reach.service');
const { buildNetworkMap } = require('./warmth.map');
const { planEnrichment } = require('./enrichment.service');
const { recommendWhoToCultivate } = require('./recommend.service');

/** El mapa completo de la red en una sola llamada. */
async function getMap(req, res) {
  const [connections, reactions, posts] = await Promise.all([
    repository.loadConnections(),
    repository.loadReactions(),
    repository.loadPosts(),
  ]);

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

  res.json({ data: { ...map, enrichment, cultivate } });
}

module.exports = { getMap };
