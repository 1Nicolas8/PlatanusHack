const Anthropic = require('@anthropic-ai/sdk');
const z = require('zod/v4');
const { zodOutputFormat } = require('@anthropic-ai/sdk/helpers/zod');
const env = require('../../config/env');
const AppError = require('../../shared/errors/AppError');

/**
 * Única puerta al proveedor LLM. Si se cambia de modelo o de proveedor, solo
 * se toca este archivo.
 *
 * Una llamada por post — no una por agente. Con 406 agentes y 12 arquetipos, la
 * diferencia es de 406 llamadas a 1.
 */

const MODEL = 'claude-haiku-4-5';

const ScoresSchema = z.object({
  scores: z.array(
    z.object({
      archetypeId: z.string(),
      attention: z.number(),
      relevance: z.number(),
      credibility: z.number(),
      engagement: z.number(),
      commercialIntent: z.number(),
      reasoning: z.string(),
    }),
  ),
});

async function scorePost({ post, archetypes, icp }) {
  if (!env.ANTHROPIC_API_KEY) throw AppError.badRequest('ANTHROPIC_API_KEY no configurada');

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 12000,
    system:
      'Puntuás cómo reaccionaría cada arquetipo de audiencia a una publicación de LinkedIn.\n' +
      'Cada dimensión va de 0 a 100. Sé severo: la mayoría de los posts de producto no ' +
      'consiguen ni atención ni credibilidad. Un post que promete sin evidencia debe puntuar ' +
      'bajo en credibility para los arquetipos escépticos.\n' +
      'DIFERENCIÁ: si dos arquetipos reaccionarían distinto, los números tienen que reflejarlo. ' +
      'Puntuar todo parecido no es prudencia, es no responder.\n' +
      'reasoning cita algo concreto del texto, no una generalidad.',
    messages: [
      {
        role: 'user',
        content:
          `${icp ? `ICP del founder: ${icp}\n\n` : ''}Arquetipos:\n` +
          archetypes
            .map((a) => `- ${a.id} | ${a.label}${a.awareness ? ` | awareness: ${a.awareness}` : ''}`)
            .join('\n') +
          `\n\nPublicación:\n"""${post}"""\n\nPuntuá la publicación para cada arquetipo.`,
      },
    ],
    output_config: { format: zodOutputFormat(ScoresSchema) },
  });

  if (!response.parsed_output) throw AppError.badRequest('El modelo no devolvió puntuaciones válidas');
  return response.parsed_output.scores;
}

module.exports = { scorePost, MODEL };
