const { z } = require('zod');

/**
 * Los topes no son arbitrarios: cada evaluación cuesta panel × rondas ×
 * iteraciones llamadas al modelo. Con los máximos de acá son 600, que ya es
 * caro y lento; más que eso no mejora la respuesta, solo la factura.
 */
const evaluarSchema = z.object({
  perfil: z.string().trim().min(1, 'Falta el perfil dueño de la red.'),
  copy: z.string().trim().min(10, 'El copy es demasiado corto para evaluarlo.').max(5000),
  icp: z.string().trim().min(3).optional(),
  panel: z.number().int().min(3).max(40).optional(),
  rondas: z.number().int().min(1).max(3).optional(),
  iteraciones: z.number().int().min(1).max(5).optional(),
  // Fija el jurado: la misma semilla elige el mismo panel, y así dos copys se
  // pueden comparar contra las mismas personas.
  semilla: z.string().trim().min(1).optional(),
});

const corridaIdSchema = z.object({ corridaId: z.string().trim().min(1) });

const historialQuerySchema = z.object({
  perfil: z.string().trim().min(1),
  limite: z.coerce.number().int().min(1).max(50).optional(),
});

module.exports = { evaluarSchema, corridaIdSchema, historialQuerySchema };
