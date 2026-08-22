const logger = require('../logger/logger');
const AppError = require('../errors/AppError');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      details: err.details,
    });
  }

  logger.error({ err, path: req.path }, 'Unhandled error');
  return res.status(500).json({ error: 'Internal server error' });
}

module.exports = errorHandler;
