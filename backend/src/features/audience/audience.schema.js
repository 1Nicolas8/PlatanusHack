const { z } = require('zod');

const AWARENESS = ['unaware', 'problem-aware', 'solution-aware', 'product-aware'];
const PRICE_SENSITIVITY = ['low', 'medium', 'high'];

/** Valor numérico de la sensibilidad al precio, para poder variarla dentro del grupo. */
const PRICE_SENSITIVITY_SCORE = { low: 20, medium: 50, high: 80 };

/** Arquetipo tal como lo devuelve el LLM (SIM-10). */
const archetypeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  role: z.string().optional(),
  companySize: z.string().optional(),
  awareness: z.enum(AWARENESS),
  painPoints: z.array(z.string()).default([]),
  objections: z.array(z.string()).default([]),
  priceSensitivity: z.enum(PRICE_SENSITIVITY),
  contentBehavior: z.string().optional(),
  purchaseIntent: z.number().min(0).max(100),
  // El modelo no lo normaliza de forma confiable: medido 1.10 en una corrida.
  // Se normaliza en el generador, nunca se confía en el valor crudo.
  sharePopulation: z.number().nonnegative(),
});

/** Contexto de mercado del founder (SIM-8). */
const marketContextSchema = z.object({
  product: z.string().min(1),
  icp: z.string().min(1),
  industry: z.string().min(1),
  location: z.string().min(1),
  buyer: z.string().min(1),
  goal: z.string().min(1),
});

const generatePopulationInputSchema = z.object({
  archetypes: z.array(archetypeSchema).min(1),
  context: marketContextSchema,
  size: z.number().int().positive().default(200),
  seed: z.string().min(1),
});

module.exports = {
  AWARENESS,
  PRICE_SENSITIVITY,
  PRICE_SENSITIVITY_SCORE,
  archetypeSchema,
  marketContextSchema,
  generatePopulationInputSchema,
};
