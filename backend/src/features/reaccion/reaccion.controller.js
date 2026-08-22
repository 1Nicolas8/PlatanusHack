const reaccionService = require('./reaccion.service');

async function simular(req, res) {
  const data = await reaccionService.simulateReaction(req.body);
  res.json(data);
}

module.exports = { simular };
