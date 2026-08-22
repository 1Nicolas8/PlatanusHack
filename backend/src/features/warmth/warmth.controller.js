const repository = require('./warmth.repository');
const { computeWarmth } = require('./warmth.service');
const { rankByReach } = require('./reach.service');
const { buildNetworkMap } = require('./warmth.map');

/** El mapa completo de la red en una sola llamada. */
async function getMap(req, res) {
  const [connections, reactions, posts] = await Promise.all([
    repository.loadConnections(),
    repository.loadReactions(),
    repository.loadPosts(),
  ]);

  const warmth = computeWarmth({ connections, reactions, posts });
  const reach = rankByReach({ connections, reactions });

  res.json({ data: buildNetworkMap({ warmth, reach, posts }) });
}

module.exports = { getMap };
