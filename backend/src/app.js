const express = require('express');
const cors = require('cors');
const pinoHttp = require('pino-http');

const logger = require('./shared/logger/logger');
const errorHandler = require('./shared/middlewares/errorHandler');
const notFound = require('./shared/middlewares/notFound');
const { checkDatabase } = require('./shared/health/health.service');
const audienciaRoutes = require('./features/audiencia/audiencia.routes');
const alcanceRoutes = require('./features/alcance/alcance.routes');
const reaccionRoutes = require('./features/reaccion/reaccion.routes');
const networkRoutes = require('./features/network/network.routes');
const scoringRoutes = require('./features/scoring/scoring.routes');
const panelRoutes = require('./features/panel/panel.routes');
const perfilesRoutes = require('./features/perfiles/perfiles.routes');
const warmthRoutes = require('./features/warmth/warmth.routes');

function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(pinoHttp({ logger }));

  // Liveness: el proceso responde. Sin I/O, para que un uptime check no
  // dependa de servicios externos.
  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  // Readiness: además llega a la base. 503 si no, para que un checker lo lea
  // como caído sin tener que parsear el body.
  app.get('/health/ready', async (req, res) => {
    const database = await checkDatabase();
    res.status(database.ok ? 200 : 503).json({
      status: database.ok ? 'ready' : 'degraded',
      database,
    });
  });

  // Cada feature monta sus propias rutas bajo su propio prefijo — app.js solo
  // conoce el mapeo prefijo -> feature, nunca lógica de negocio.
  app.use('/api/audiencia', audienciaRoutes);
  app.use('/api/alcance', alcanceRoutes);
  app.use('/api/reaccion', reaccionRoutes);
  app.use('/api/network', networkRoutes);
  app.use('/api/simulation', scoringRoutes);
  app.use('/api/red', warmthRoutes);
  app.use('/api/panel', panelRoutes);
  app.use('/api/perfiles', perfilesRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
