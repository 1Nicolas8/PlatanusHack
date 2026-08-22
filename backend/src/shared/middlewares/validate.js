const AppError = require('../errors/AppError');

/**
 * Middleware genérico de validación con Zod. Uso:
 *   router.post('/', validate({ body: createAgentSchema }), controller.create)
 */
function validate(schemas) {
  return (req, res, next) => {
    for (const key of ['params', 'query', 'body']) {
      const schema = schemas[key];
      if (!schema) continue;

      const result = schema.safeParse(req[key]);
      if (!result.success) {
        return next(AppError.badRequest(`Invalid ${key}`, result.error.flatten()));
      }
      req[key] = result.data;
    }
    return next();
  };
}

module.exports = validate;
