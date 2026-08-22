// Vercel serverless entrypoint.
//
// Files under api/ become Vercel Functions with an explicit (req, res)
// signature, so this does not depend on framework auto-detection. An Express
// app IS a (req, res) handler, so exporting the instance is enough; vercel.json
// rewrites every path here and Express does its own routing.
//
// Local development uses src/server.js instead: it listens on a port and also
// starts the in-process pollers and orchestrator, which serverless cannot run.
const createApp = require('../src/app');

module.exports = createApp();
