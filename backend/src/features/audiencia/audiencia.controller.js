const audienciaService = require('./audiencia.service');

async function resumen(req, res) {
  const data = await audienciaService.getResumen({ limit: req.query.limit });
  res.json(data);
}

module.exports = { resumen };
