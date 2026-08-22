const { Router } = require('express');
const validate = require('../../shared/middlewares/validate');
const asyncHandler = require('../../shared/utils/asyncHandler');
const { resumenQuerySchema } = require('./audiencia.schema');
const controller = require('./audiencia.controller');

const router = Router();

router.get('/resumen', validate({ query: resumenQuerySchema }), asyncHandler(controller.resumen));

module.exports = router;
