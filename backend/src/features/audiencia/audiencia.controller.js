const audienciaService = require('./audiencia.service');
const { normalizeProfileUrl } = require('../../shared/utils/profileKey');

async function resumen(req, res) {
  const data = await audienciaService.getResumen({
    perfilUrl: normalizeProfileUrl(req.query.perfil),
    limit: req.query.limit,
  });
  res.json({ data });
}

module.exports = { resumen };
