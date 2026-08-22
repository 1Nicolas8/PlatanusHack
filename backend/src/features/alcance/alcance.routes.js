const { Router } = require('express');
const validate = require('../../shared/middlewares/validate');
const asyncHandler = require('../../shared/utils/asyncHandler');
const { estimarAlcanceBodySchema } = require('./alcance.schema');
const controller = require('./alcance.controller');

const router = Router();

router.post('/estimar', validate({ body: estimarAlcanceBodySchema }), asyncHandler(controller.estimar));

module.exports = router;
