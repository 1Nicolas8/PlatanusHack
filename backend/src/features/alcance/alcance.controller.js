const alcanceService = require('./alcance.service');

async function estimar(req, res) {
  const data = await alcanceService.estimateReach({ copy: req.body.copy });
  res.json({ data });
}

module.exports = { estimar };
