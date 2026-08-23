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
  'Tu ficha trae un historial observado de cómo reaccionaste a posts de esta persona: a cuál, cuándo',
  'y con qué gesto (like, celebración, corazón) o con qué comentario. Eso no se inventa ni se contradice.',
  'Si nunca reaccionaste, no finjas cercanía. Si ya le celebraste un post, no te hagas el indiferente genérico.',
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
  variantes: z
    .array(
      z.object({
        enfoque: z.string().trim().min(1).transform((v) => v.slice(0, 120)),
        copy: z.string().trim().min(1),
      }),
    )
    .min(1),
});

function toolInput({ response, name, schema, que }) {
  if (response.stop_reason === 'max_tokens') {
    throw new Error(`El LLM cortó ${que} a mitad de camino: la respuesta quedó incompleta.`);
  }
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
    // La escala tiene que estar anclada o el número no significa nada. Sin
    // estos tramos el modelo arrastra su prior de "la mayoría de los posts los
    // ignoro" al número y puntúa 30 hasta lo que le gustó: todo cae en tibio,
    // ningún copy pasa nunca y la herramienta se vuelve una máquina de decir
    // que no. Anclarla no es pedirle que le guste — un post que no es para vos
    // sigue puntuando bajo. Es hacer que dos scores se puedan comparar.
    'La escala, para que tu número quiera decir algo:',
    '  0-20  no es para vos: cortás de leer a la segunda línea.',
    ' 21-40  lo leés en diagonal y no te deja nada.',
    ' 41-60  está bien escrito y lo entendés, pero no te toca. Acá vive el like de compromiso.',
    ' 61-80  te habla a vos: reconocés la situación de la que habla y te dan ganas de reaccionar.',
    '81-100  te frena el scroll. Te da algo que no tenías, o se lo pasarías a alguien puntual.',
    'Usá el tramo completo. Si el copy te resultó bueno, ponelo en su tramo aunque en el feed real',
    'hubieras seguido de largo por falta de tiempo: eso último es la acción, no el score.',
    'Si algo te frena —te suena vacío, no es para vos, no te creés la promesa— eso va en objecion.',
    // Acá estaba el empujón a comentar. Existía porque `comentario` solo se
    // escribía si la acción era comentar: para sacarle el texto al agente había
    // que empujarlo a esa acción, y el resultado era un panel donde comenta
    // todo el mundo — que es justamente lo que no pasa en un feed. Se separan
    // las dos cosas: la acción es lo que haría de verdad, y el comentario es lo
    // que diría si comentara. Así el texto sale igual sin mentir sobre cuánta
    // gente comenta.
    'accion es lo que harías de verdad con este post en tu feed, sin forzar nada:',
    'lo más común es seguir de largo, y comentar es lo más caro. No comentes por cortesía.',
    'comentario es aparte: escribí siempre qué le dirías a quien publica si te sentaras a comentarlo',
    '—tu pregunta, tu objeción o lo que te resonó—, aunque tu acción sea ignorar. Eso no cambia tu acción.',
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
          comentario: {
            type: 'string',
            maxLength: 280,
            description: 'Qué le dirías a quien publica si lo comentaras. Se escribe siempre, aunque tu acción sea ignorar.',
          },
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
 * El oficio que se le pide al reescritor.
 *
 * Está acá y no diluido en el prompt porque es el corazón del feature: la
 * versión anterior solo pedía "responder a las objeciones", y un copy que
 * únicamente tapa quejas queda defensivo — pierde lo que sí funcionaba y no le
 * da a nadie una razón para leer la segunda línea. Por eso el panel también
 * rechazaba el copy que la herramienta misma recomendaba.
 */
const OFICIO = [
  'Cómo tiene que estar escrito cada variante:',
  '- La primera línea se gana la segunda. Sin "estoy feliz de anunciar", sin "en un mundo donde",',
  '  sin pregunta retórica de apertura y sin la promesa antes del hecho.',
  '- Escribís para las personas de la lista de arriba, no para "el mercado". Que se note que el copy',
  '  entiende la situación concreta en la que están.',
  '- Cada afirmación se apoya en algo concreto que YA está en el copy original: un número, un nombre,',
  '  un caso puntual. Si el original no lo tiene, no lo inventes: bajá la afirmación hasta lo que se',
  '  puede sostener. Inventar un dato es peor que un copy tibio.',
  '- Nada de superlativos, promesas de resultado, ni jerga de agencia (revolucionario, game changer,',
  '  potenciar, sinergia, "no es solo X, es Y", "esto lo cambia todo").',
  '- Frases cortas. El texto entra sin "ver más" salvo que el original ya fuera largo a propósito.',
  '- El cierre le da a alguien de la lista una razón real para responder: una pregunta que solo esa',
  '  gente puede contestar desde su experiencia, o un dato discutible. Nunca "¿qué opinás?".',
  '',
  'Lo que NO se busca: que reaccionen por obligación. No metas ganchos, urgencia falsa ni pedidos',
  'de interacción. Si el tema no le interesa a esta gente, ningún truco lo arregla — y un copy honesto',
  'que le habla bien a seis de doce vale más que uno que le grita a los doce.',
].join('\n');

/**
 * Las mejoras.
 *
 * El diagnóstico y cada cambio se anclan a lo que el panel dijo — objeción o
 * frase textual — porque el consejo de copywriting genérico lo da cualquiera.
 * Pero la reescritura recibe tres cosas más que la evidencia negativa: quiénes
 * son las personas que van a leer, qué del copy original SÍ les funcionó, y el
 * oficio de arriba. Devuelve varias variantes con enfoques distintos; cuál
 * gana no lo decide el modelo, lo decide el panel volviendo a votarlas.
 */
async function suggestImprovements({ copy, icp, evidencia, variantes = 2, client = new Anthropic() }) {
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
    'Quiénes son los que van a leer la reescritura:',
    ...(evidencia.audiencia ?? []).map((p) => `- ${p.nombre}${p.headline ? ` — ${p.headline}` : ''}`),
    '',
    'Objeciones que pusieron, de la más repetida a la menos:',
    ...evidencia.objeciones.map((o) => `- (${o.veces}x) ${o.texto}`),
    '',
    'Comentarios textuales del panel:',
    ...evidencia.comentarios.map((c) => `- ${c.nombre}: "${c.comentario}"`),
    '',
    // Sin esto la reescritura tapa las quejas y de paso borra lo único que
    // estaba enganchando. Lo que funcionó se conserva a propósito.
    (evidencia.loQueFunciono ?? []).length
      ? [
        'Lo que SÍ les funcionó del original — esto se conserva, no se tira:',
        ...evidencia.loQueFunciono.map((r) => `- ${r.nombre}: ${r.razon}`),
      ].join('\n')
      : 'A nadie del panel le funcionó nada del original: la reescritura arranca casi de cero.',
    '',
    'Proponé cambios concretos. Cada mejora tiene que responder a una objeción de arriba,',
    'y en evidencia citás cuál. No propongas nada que el panel no haya señalado.',
    '',
    `Después escribí ${variantes} variantes completas del post, cada una con un enfoque distinto`,
    '(por ejemplo: arrancar por el dato duro, arrancar por la escena concreta, arrancar por la',
    'objeción que más se repitió y responderla de frente). Mismo idioma y registro que el original.',
    'En enfoque decís en pocas palabras qué probás con esa variante.',
    '',
    OFICIO,
  ]
    .filter(Boolean)
    .join('\n');

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    temperature: 1,
    system: [
      'Sos un editor de copy que solo se mueve con evidencia: cada cambio que proponés responde a una',
      'objeción concreta que alguien del panel puso.',
      'Y escribís bien. Tu reescritura no es el original con las quejas tapadas: es el mejor post honesto',
      'que se puede escribir sobre lo que el original quería decir, para las personas concretas que lo',
      'van a leer. No inventás datos, no prometés resultados y no pedís interacción.',
    ].join(' '),
    messages: [{ role: 'user', content: prompt }],
    tools: [{
      name: IMPROVE_TOOL,
      description: 'Devuelve el diagnóstico, las mejoras ancladas a objeciones y las variantes reescritas.',
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
          variantes: {
            type: 'array',
            minItems: 1,
            maxItems: 4,
            items: {
              type: 'object',
              properties: {
                enfoque: { type: 'string', minLength: 1, maxLength: 120 },
                copy: { type: 'string', minLength: 1 },
              },
              required: ['enfoque', 'copy'],
              additionalProperties: false,
            },
          },
        },
        required: ['diagnostico', 'mejoras', 'variantes'],
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

module.exports = { judgeCopy, suggestImprovements, MODEL, ACCIONES, SYSTEM_JUDGE };
