const { z } = require('zod');

const simularReaccionBodySchema = z.object({
  copy: z.string().trim().min(1).max(5000),
  corridaId: z.string().trim().min(1).optional(),
});

module.exports = { simularReaccionBodySchema };
