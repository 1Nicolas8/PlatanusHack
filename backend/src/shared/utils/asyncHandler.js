/**
 * Envuelve un controller async para que sus rechazos lleguen al errorHandler
 * central en vez de quedar como unhandled rejection.
 */
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = asyncHandler;
