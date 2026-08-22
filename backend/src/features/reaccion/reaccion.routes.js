const { Router } = require('express');
const validate = require('../../shared/middlewares/validate');
const asyncHandler = require('../../shared/utils/asyncHandler');
const { simularReaccionBodySchema } = require('./reaccion.schema');
const controller = require('./reaccion.controller');

const router = Router();

router.post('/', validate({ body: simularReaccionBodySchema }), asyncHandler(controller.simular));

module.exports = router;
