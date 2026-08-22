const express = require('express');
const validate = require('../../shared/middlewares/validate');
const asyncHandler = require('../../shared/utils/asyncHandler');
const controller = require('./panel.controller');
const { evaluarSchema, corridaIdSchema, historialQuerySchema } = require('./panel.schema');

const router = express.Router();

router.post('/evaluaciones', validate({ body: evaluarSchema }), asyncHandler(controller.evaluar));
router.get('/corridas', validate({ query: historialQuerySchema }), asyncHandler(controller.getHistorial));
router.get(
  '/corridas/:corridaId',
  validate({ params: corridaIdSchema }),
  asyncHandler(controller.getCorrida),
);

module.exports = router;
