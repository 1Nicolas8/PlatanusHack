const { z } = require('zod');

const resumenQuerySchema = z.object({
  perfil: z.string().trim().min(1),
  limit: z.coerce.number().int().min(1).max(20).default(6),
});

module.exports = { resumenQuerySchema };
