const { z } = require('zod');

/**
 * `panel` es un TECHO de costo, no la cantidad de gente que opina.
 *
 * Cuántos ven el post lo decide la puerta de exposición a partir de las
 * reacciones reales de tus publicaciones: si tus posts juntan nueve reacciones,
 * lo verían unas noventa personas, y ese es el número que manda aunque tu red
 * tenga cuatrocientos contactos. Este parámetro solo dice a cuántos de esos se
 * les pregunta de verdad — el resto se estima escalando lo que contestaron los
 * que sí, y la respuesta marca que fue estimado.
 *
 * Subirlo hasta cubrir a todos los expuestos convierte la estimación en censo.
 * Cada evaluación cuesta panel × rondas × iteraciones llamadas al modelo, así
 * que el máximo alto solo tiene sentido con rondas e iteraciones en 1.
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

/**
 * El backtest corre una sola ronda y una sola pasada, así que su costo es
 * exactamente el tamaño del panel. Por eso admite paneles grandes: medir contra
 * un post real vale más que ahorrarse llamadas.
 */
const backtestSchema = z.object({
  perfil: z.string().trim().min(1, 'Falta el perfil dueño de la red.'),
  // Qué publicación evaluar. Sin esto se toma la última con métricas.
  orden: z.number().int().min(1).optional(),
  panel: z.number().int().min(3).max(500).optional(),
  icp: z.string().trim().min(3).optional(),
  semilla: z.string().trim().min(1).optional(),
});

const corridaIdSchema = z.object({ corridaId: z.string().trim().min(1) });

const historialQuerySchema = z.object({
  perfil: z.string().trim().min(1),
  limite: z.coerce.number().int().min(1).max(50).optional(),
});

module.exports = { evaluarSchema, backtestSchema, corridaIdSchema, historialQuerySchema };
