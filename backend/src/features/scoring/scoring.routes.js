const express = require('express');
const validate = require('../../shared/middlewares/validate');
const asyncHandler = require('../../shared/utils/asyncHandler');
const controller = require('./scoring.controller');
const { compareSchema } = require('./scoring.schema');

const router = express.Router();

router.post('/compare', validate({ body: compareSchema }), asyncHandler(controller.compare));

module.exports = router;
