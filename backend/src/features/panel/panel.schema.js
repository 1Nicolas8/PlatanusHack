const { z } = require('zod');

/**
 * Los topes no son arbitrarios: cada evaluación cuesta panel × rondas ×
 * iteraciones llamadas al modelo. El tope de panel es 500 para poder correr
 * una red entera contra el copy —una corrida sobre TODOS los contactos, no
 * sobre una muestra— y ahí el techo teórico son 7500 llamadas.
 *
 * Ese máximo solo tiene sentido con rondas y corridas en 1: es el modo
 * "censo", donde ya no se estima nada porque opinó toda la red. Combinarlo con
 * los máximos de las otras dos es carísimo y no agrega — la dispersión entre
 * corridas existe para saber si una muestra chica era representativa, y con la
 * red completa esa pregunta no aplica.
 */
const evaluarSchema = z.object({
  perfil: z.string().trim().min(1, 'Falta el perfil dueño de la red.'),
  copy: z.string().trim().min(10, 'El copy es demasiado corto para evaluarlo.').max(5000),
  icp: z.string().trim().min(3).optional(),
  panel: z.number().int().min(3).max(500).optional(),
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
