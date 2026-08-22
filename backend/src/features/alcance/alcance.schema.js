const { z } = require('zod');

const estimarAlcanceBodySchema = z.object({
  copy: z.string().trim().min(1).max(5000),
});

module.exports = { estimarAlcanceBodySchema };
