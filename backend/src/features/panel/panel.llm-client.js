const Anthropic = require('@anthropic-ai/sdk');
const { z } = require('zod');
const env = require('../../config/env');

/**
 * Las dos llamadas al modelo que hace el panel: el juicio de un agente sobre
 * el copy, y la síntesis final de mejoras.
 *
 * La temperatura es 1 a propósito. El producto promete correr la evaluación
 * varias veces para distinguir una verdad de un caso borde, y eso solo tiene
 * sentido si hay varianza que medir: con temperatura 0 las tres iteraciones
 * darían el mismo número y la "convergencia" sería un artefacto.
 */

const MODEL = env.ANTHROPIC_MODEL || 'claude-haiku-4-5';
const JUDGE_TOOL = 'juzgar_copy';
const IMPROVE_TOOL = 'proponer_mejoras';
const ACCIONES = ['ignorar', 'like', 'comentar', 'compartir'];

const SYSTEM_JUDGE = [
  'Sos una persona real de LinkedIn leyendo el feed, no un evaluador de marketing.',
  'Juzgás el copy desde tu identidad concreta: tu trabajo, lo que te importa y tu relación con quien publica.',
  'Sos honesto: la mayoría de los posts que ves los ignorás. Reaccionar es la excepción, no el default,',
  'y comentar es lo más caro de todo — se comenta cuando algo te toca de verdad o te deja una pregunta',
  'que querés que el autor responda. Si no es tu caso, un like o seguir de largo es la respuesta sincera.',
  'No inventás datos sobre vos ni sobre el producto, y no prometés resultados.',
].join(' ');

const judgeSchema = z.object({
  score: z.number().min(0).max(100),
  accion: z.enum(ACCIONES),
  razon: z.string().trim().min(1).transform((v) => v.slice(0, 400)),
  objecion: z.string().trim().transform((v) => v.slice(0, 300)).optional(),
  comentario: z.string().trim().transform((v) => v.slice(0, 280)).optional(),
  influenciadoPor: z.string().trim().transform((v) => v.slice(0, 120)).optional(),
});

const improveSchema = z.object({
  diagnostico: z.string().trim().min(1),
  mejoras: z
    .array(
      z.object({
        cambio: z.string().trim().min(1),
        porQue: z.string().trim().min(1),
        evidencia: z.string().trim().min(1),
      }),
    )
    .min(1),
  copySugerido: z.string().trim().min(1),
});

function toolInput({ response, name, schema, que }) {
  const block = response.content.find((b) => b.type === 'tool_use' && b.name === name);
  if (!block) throw new Error(`El LLM no devolvió ${que} en formato estructurado.`);
  return schema.parse(block.input);
}

function assertApiKey() {
  if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY no está configurada.');
}

/** El feed que el agente ve antes de opinar: lo que ya dijeron sus pares. */
function renderFeed(feed) {
  if (!feed?.length) return '';
  const lineas = feed
    .map((t) => `- ${t.nombre}${t.headline ? ` (${t.headline})` : ''}: "${t.comentario}"`)
    .join('\n');

  return [
    '',
    'Antes de decidir, viste que en los comentarios del post ya escribieron otros contactos:',
    lineas,
    '',
    'Podés tener en cuenta lo que dijeron —darles la razón, discutirles o ignorarlos—,',
    'como harías en LinkedIn de verdad. Si alguien te cambió la lectura, decí quién en influenciadoPor.',
  ].join('\n');
}

/**
 * El juicio de un agente sobre el copy.
 *
 * @param {object}   params
 * @param {string}   params.copy
 * @param {object}   params.persona   salida de buildPersona
 * @param {object[]} params.feed      comentarios visibles de la ronda anterior
 * @param {number}   params.ronda
 * @param {string}   [params.icp]
 */
async function judgeCopy({ copy, persona, feed = [], ronda = 1, icp, client = new Anthropic() }) {
  assertApiKey();

  const prompt = [
    persona.ficha,
    '',
    icp ? `Quien publica le vende a: ${icp}` : '',
    '',
    'Esto acaba de aparecer en tu feed:',
    '---',
    copy,
    '---',
    renderFeed(feed),
    '',
    'Decidí qué hacés. score es qué tanto te habla a VOS este copy, de 0 a 100.',
    'Si algo te frena —te suena vacío, no es para vos, no te creés la promesa— eso va en objecion.',
    // Sin esta línea el modelo se va al like silencioso en el 100% de los
    // casos y el panel nunca escribe nada: la ronda 2 no tendría qué leer y la
    // deliberación no existiría. Con ella comenta de más — bastante más que un
    // feed real. Se elige eso a propósito: lo que se quiere del panel es la
    // objeción textual, no estimar cuánta gente comenta. El volumen esperado
    // lo responde el motor calibrado contra reacciones observadas, y la
    // respuesta lo dice explícitamente para que nadie lea una cosa por la otra.
    'Si te quedó una pregunta concreta para quien publica, o una objeción que le dirías de frente,',
    'comentarla es lo natural: no todo se resuelve con un like.',
    'Escribí comentario solo si tu acción es comentar o compartir.',
  ]
    .filter((linea) => linea !== undefined)
    .join('\n');

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 600,
    temperature: 1,
    system: SYSTEM_JUDGE,
    messages: [{ role: 'user', content: prompt }],
    tools: [{
      name: JUDGE_TOOL,
      description: 'Registra tu reacción al copy desde tu identidad.',
      input_schema: {
        type: 'object',
        properties: {
          score: { type: 'number', minimum: 0, maximum: 100 },
          accion: { type: 'string', enum: ACCIONES },
          razon: { type: 'string', minLength: 1, maxLength: 400 },
          objecion: { type: 'string', maxLength: 300 },
          comentario: { type: 'string', maxLength: 280 },
          influenciadoPor: {
            type: 'string',
            maxLength: 120,
            description: 'Solo el nombre de quien te movió la lectura, sin explicación. Vacío si nadie.',
          },
        },
        required: ['score', 'accion', 'razon'],
        additionalProperties: false,
      },
    }],
    tool_choice: { type: 'tool', name: JUDGE_TOOL },
  });

  return {
    prompt,
    ronda,
    ...toolInput({ response, name: JUDGE_TOOL, schema: judgeSchema, que: 'un veredicto' }),
  };
}

/**
 * Las mejoras.
 *
 * Se alimentan solo de lo que el panel dijo — objeciones y frases textuales —
 * y no del copy a secas. Un consejo de copywriting genérico lo da cualquiera;
 * el valor está en que cada cambio propuesto responda a una objeción que
 * alguien de tu red efectivamente puso.
 */
async function suggestImprovements({ copy, icp, evidencia, client = new Anthropic() }) {
  assertApiKey();

  const prompt = [
    'Copy evaluado:',
    '---',
    copy,
    '---',
    icp ? `Le vende a: ${icp}` : '',
    '',
    `Lo simuló un panel de ${evidencia.panel} contactos reales de la red, ${evidencia.iteraciones} veces.`,
    `Score promedio: ${evidencia.score}/100. Reaccionó el ${evidencia.tasaEngagement}% del panel.`,
    '',
    'Objeciones que pusieron, de la más repetida a la menos:',
    ...evidencia.objeciones.map((o) => `- (${o.veces}x) ${o.texto}`),
    '',
    'Comentarios textuales del panel:',
    ...evidencia.comentarios.map((c) => `- ${c.nombre}: "${c.comentario}"`),
    '',
    'Proponé cambios concretos. Cada mejora tiene que responder a una objeción de arriba,',
    'y en evidencia citás cuál. No propongas nada que el panel no haya señalado.',
    'copySugerido es el copy reescrito aplicando las mejoras, en el mismo idioma y tono del original.',
  ]
    .filter(Boolean)
    .join('\n');

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    temperature: 1,
    system:
      'Sos un editor de copy que solo se mueve con evidencia. No opinás por gusto: cada cambio que proponés responde a una objeción concreta que alguien del panel puso.',
    messages: [{ role: 'user', content: prompt }],
    tools: [{
      name: IMPROVE_TOOL,
      description: 'Devuelve el diagnóstico, las mejoras ancladas a objeciones y el copy reescrito.',
      input_schema: {
        type: 'object',
        properties: {
          diagnostico: { type: 'string', minLength: 1 },
          mejoras: {
            type: 'array',
            minItems: 1,
            maxItems: 4,
            items: {
              type: 'object',
              properties: {
                cambio: { type: 'string', minLength: 1 },
                porQue: { type: 'string', minLength: 1 },
                evidencia: { type: 'string', minLength: 1 },
              },
              required: ['cambio', 'porQue', 'evidencia'],
              additionalProperties: false,
            },
          },
          copySugerido: { type: 'string', minLength: 1 },
        },
        required: ['diagnostico', 'mejoras', 'copySugerido'],
        additionalProperties: false,
      },
    }],
    tool_choice: { type: 'tool', name: IMPROVE_TOOL },
  });

  return {
    prompt,
    ...toolInput({ response, name: IMPROVE_TOOL, schema: improveSchema, que: 'las mejoras' }),
  };
}

module.exports = { judgeCopy, suggestImprovements, MODEL, ACCIONES };
