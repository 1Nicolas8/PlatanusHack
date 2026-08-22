const express = require('express');
const cors = require('cors');
const pinoHttp = require('pino-http');

const logger = require('./shared/logger/logger');
const errorHandler = require('./shared/middlewares/errorHandler');
const notFound = require('./shared/middlewares/notFound');
const { checkDatabase } = require('./shared/health/health.service');

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
  // app.use('/api/<feature>', <feature>Routes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
