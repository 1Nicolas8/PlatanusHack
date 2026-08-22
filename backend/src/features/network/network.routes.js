const express = require('express');
const validate = require('../../shared/middlewares/validate');
const asyncHandler = require('../../shared/utils/asyncHandler');
const controller = require('./network.controller');
const { startRunSchema, runIdSchema, runQuerySchema } = require('./network.schema');

const router = express.Router();

// 202 y no 200: la extracción arranca, no termina. El cliente hace polling.
router.post('/runs', validate({ body: startRunSchema }), asyncHandler(controller.startRun));

router.get(
  '/runs/:runId',
  validate({ params: runIdSchema, query: runQuerySchema }),
  asyncHandler(controller.getRunStatus),
);

module.exports = router;
