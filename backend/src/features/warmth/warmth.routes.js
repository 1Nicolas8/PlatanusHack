const express = require('express');
const asyncHandler = require('../../shared/utils/asyncHandler');
const controller = require('./warmth.controller');

const router = express.Router();

router.get('/mapa', asyncHandler(controller.getMap));

module.exports = router;
