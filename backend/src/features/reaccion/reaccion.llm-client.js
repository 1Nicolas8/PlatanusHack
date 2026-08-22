const Anthropic = require('@anthropic-ai/sdk');
const { z } = require('zod');
const env = require('../../config/env');

const MODEL = env.ANTHROPIC_MODEL || 'claude-haiku-4-5';
const TOOL_NAME = 'evaluar_reaccion_arquetipo';
const INDIVIDUAL_COMMENT_TOOL_NAME = 'generar_comentario_individual';

const verdictSchema = z.object({
  probLike: z.number().min(0).max(1),
  probComentario: z.number().min(0).max(1),
  probIgnorar: z.number().min(0).max(1),
  comentarioEjemplo: z.string().trim().min(1).transform((value) => value.slice(0, 280)),
});

function getToolInput(response) {
  const toolUse = response.content.find((block) => block.type === 'tool_use' && block.name === TOOL_NAME);
  if (!toolUse) throw new Error('El LLM no devolvió un veredicto estructurado de reacción.');

  return verdictSchema.parse(toolUse.input);
}

async function evaluateArchetypeReaction({ copy, archetype, client = new Anthropic() }) {
  if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY no está configurada.');

  const prompt = `Copy a evaluar:\n${copy}\n\nArquetipo:\nNombre: ${archetype.nombre}\nDescripción: ${archetype.descripcion}\nAwareness: ${archetype.awareness}\nObjeciones: ${archetype.objeciones}\nPain points: ${archetype.painPoints}\nSensibilidad al precio: ${archetype.sensibilidadPrecio}\nIntención de compra: ${archetype.intencionCompra}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 500,
    system: 'Sos un miembro de una audiencia B2B en LinkedIn. Evaluás un copy desde un arquetipo específico sin inventar datos ni prometer resultados.',
    messages: [{
      role: 'user',
      content: prompt,
    }],
    tools: [{
      name: TOOL_NAME,
      description: 'Devuelve probabilidades de reacción y un comentario en primera persona de máximo 220 caracteres desde el arquetipo.',
      input_schema: {
        type: 'object',
        properties: {
          probLike: { type: 'number', minimum: 0, maximum: 1 },
          probComentario: { type: 'number', minimum: 0, maximum: 1 },
          probIgnorar: { type: 'number', minimum: 0, maximum: 1 },
          comentarioEjemplo: { type: 'string', minLength: 1, maxLength: 220 },
        },
        required: ['probLike', 'probComentario', 'probIgnorar', 'comentarioEjemplo'],
        additionalProperties: false,
      },
    }],
    tool_choice: { type: 'tool', name: TOOL_NAME },
  });

  return { prompt, ...getToolInput(response) };
}

async function generateIndividualComment({ copy, archetype, nombre, headline, client = new Anthropic() }) {
  if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY no está configurada.');

  const prompt = `Copy publicado:\n${copy}\n\nTu identidad:\nNombre: ${nombre}\nHeadline: ${headline || 'No disponible'}\n\nContexto de tu arquetipo:\nNombre: ${archetype.nombre}\nDescripción: ${archetype.descripcion}\nAwareness: ${archetype.awareness}\nObjeciones: ${archetype.objeciones}\nPain points: ${archetype.painPoints}\nSensibilidad al precio: ${archetype.sensibilidadPrecio}\nIntención de compra: ${archetype.intencionCompra}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 180,
    system: 'Sos un miembro de una audiencia B2B en LinkedIn. Escribís un comentario breve, genuino y específico, sin inventar datos ni prometer resultados.',
    messages: [{
      role: 'user',
      content: prompt,
    }],
    tools: [{
      name: INDIVIDUAL_COMMENT_TOOL_NAME,
      description: 'Devuelve únicamente un comentario en primera persona de máximo 220 caracteres coherente con la identidad y el arquetipo.',
      input_schema: {
        type: 'object',
        properties: {
          comentario: { type: 'string', minLength: 1, maxLength: 220 },
        },
        required: ['comentario'],
        additionalProperties: false,
      },
    }],
    tool_choice: { type: 'tool', name: INDIVIDUAL_COMMENT_TOOL_NAME },
  });
  const toolUse = response.content.find(
    (block) => block.type === 'tool_use' && block.name === INDIVIDUAL_COMMENT_TOOL_NAME,
  );
  if (!toolUse) throw new Error('El LLM no devolvió un comentario individual estructurado.');

  const { comentario } = z.object({ comentario: z.string().trim().min(1).transform((value) => value.slice(0, 280)) })
    .parse(toolUse.input);

  return { prompt, comentario };
}

module.exports = { evaluateArchetypeReaction, generateIndividualComment };
