const express = require('express');
const validate = require('../../shared/middlewares/validate');
const asyncHandler = require('../../shared/utils/asyncHandler');
const controller = require('./perfiles.controller');
const { ingestSchema, perfilQuerySchema } = require('./perfiles.schema');

const router = express.Router();

router.post('/', validate({ body: ingestSchema }), asyncHandler(controller.ingest));
router.get('/cobertura', validate({ query: perfilQuerySchema }), asyncHandler(controller.getCoverage));

module.exports = router;
