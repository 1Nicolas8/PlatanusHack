const { z } = require('zod');

const compareSchema = z.object({
  postA: z.string().min(10, 'El post A es demasiado corto para evaluarlo'),
  postB: z.string().min(10, 'El post B es demasiado corto para evaluarlo'),
  icp: z.string().min(3).optional(),
  withRecommendation: z.boolean().optional(),
});

module.exports = { compareSchema };
