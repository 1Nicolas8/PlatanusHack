/**
 * Error de dominio con status HTTP explícito. Cualquier error esperado
 * (validación, negocio, not-found) debe lanzarse como AppError para que el
 * errorHandler central lo distinga de un bug no controlado.
 */
class AppError extends Error {
  constructor(message, statusCode = 400, details = undefined) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, AppError);
  }

  static badRequest(message, details) {
    return new AppError(message, 400, details);
  }

  static notFound(message) {
    return new AppError(message, 404);
  }

  static conflict(message) {
    return new AppError(message, 409);
  }

  static unauthorized(message) {
    return new AppError(message, 401);
  }

  static forbidden(message) {
    return new AppError(message, 403);
  }
}

module.exports = AppError;
