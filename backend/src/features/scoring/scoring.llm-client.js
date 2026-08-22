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
      // Dos objetivos SEPARADOS, no uno. Medirlos juntos fue lo que hizo que
      // el motor rankeara mal: un logro personal dispara felicitaciones sin
      // ninguna intencion de compra, y mezclarlos borra las dos señales.
      socialEngagement: z.number(),
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
      'Cada dimensión va de 0 a 100.\n\n' +
      'socialEngagement y commercialIntent son INDEPENDIENTES y a menudo se mueven al revés:\n' +
      '- socialEngagement es la probabilidad de que reaccione, comente o comparta. En LinkedIn ' +
      'los logros personales (premios, nuevo trabajo, becas, hackathons ganadas) disparan olas ' +
      'de felicitaciones y son de lo MÁS reaccionado, aunque no vendan nada. Las historias ' +
      'personales y las opiniones también. Los anuncios de producto, en cambio, se ignoran.\n' +
      '- commercialIntent es si ese arquetipo se acercaría más a comprar. Un post de felicitación ' +
      'puede tener socialEngagement 90 y commercialIntent 5. Un caso de estudio con números ' +
      'puede tener socialEngagement 30 y commercialIntent 80.\n\n' +
      'Sé severo con credibility: un post que promete sin evidencia puntúa bajo para los ' +
      'arquetipos escépticos.\n' +
      'DIFERENCIÁ entre arquetipos: si dos reaccionarían distinto, los números tienen que ' +
      'reflejarlo. Puntuar todo parecido no es prudencia, es no responder.\n' +
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
