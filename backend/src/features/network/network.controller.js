const service = require('./network.service');

async function startRun(req, res) {
  const run = await service.startRun(req.body);
  res.status(202).json({ data: run });
}

async function getRunStatus(req, res) {
  const status = await service.getRunStatus(req.params.runId, { persist: req.query.persist ?? true });
  res.json({ data: status });
}

module.exports = { startRun, getRunStatus };
