const Anthropic = require('@anthropic-ai/sdk');
const z = require('zod/v4');
const { zodOutputFormat } = require('@anthropic-ai/sdk/helpers/zod');

const MODEL = 'claude-haiku-4-5';
const BATCH_SIZE = 40;

const ClassificationSchema = z.object({
  results: z.array(
    z.object({
      headline: z.string(),
      isIcp: z.boolean(),
      confidence: z.number().min(0).max(1),
      reason: z.string(),
    }),
  ),
});

/**
 * Clasifica headlines contra el ICP del founder.
 *
 * Agrupa por headline único antes de preguntar: en una red de 2.000 contactos
 * hay muchos menos headlines distintos que personas, así que el costo escala
 * con la variedad y no con el tamaño de la red. Sin esto, clasificar una red
 * grande costaría de más sin agregar información.
 */
async function classifyHeadlines({ contacts, icp, apiKey }) {
  const byContactId = new Map();

  const unique = [...new Set(contacts.map((c) => c.headline).filter(Boolean))];
  // Sin ICP no hay contra que clasificar: se devuelve la red sin esa capa en
  // vez de fallar. El analisis de alcance y relevancia no depende del ICP.
  if (unique.length === 0 || !apiKey || !icp) {
    for (const c of contacts) {
      byContactId.set(c.id, { isIcp: false, confidence: 0, reason: !icp ? 'sin ICP definido' : 'sin headline o sin API key' });
    }
    return { byContactId, uniqueHeadlines: unique.length, llmCalls: 0 };
  }

  const client = new Anthropic({ apiKey });
  const verdictByHeadline = new Map();
  let llmCalls = 0;

  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const batch = unique.slice(i, i + BATCH_SIZE);

    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 8000,
      system:
        'Clasificas headlines de LinkedIn contra un perfil de cliente ideal (ICP).\n' +
        'Sé estricto: isIcp true solo si la persona PODRÍA COMPRAR o decidir la compra. ' +
        'Alguien que trabaja en el mismo sector pero no decide, no es ICP. ' +
        'Un proveedor del sector tampoco: le vende a tu mismo comprador, no te compra.\n' +
        'confidence de 0 a 1. reason en una línea, citando lo que viste en el headline.',
      messages: [
        {
          role: 'user',
          content: `ICP: ${icp}\n\nHeadlines:\n${batch.map((h, n) => `${n + 1}. ${h}`).join('\n')}`,
        },
      ],
      output_config: { format: zodOutputFormat(ClassificationSchema) },
    });
    llmCalls += 1;

    for (const result of response.parsed_output?.results ?? []) {
      verdictByHeadline.set(result.headline, result);
    }
  }

  for (const contact of contacts) {
    const verdict = verdictByHeadline.get(contact.headline);
    byContactId.set(contact.id, {
      isIcp: verdict?.isIcp ?? false,
      confidence: verdict?.confidence ?? 0,
      reason: verdict?.reason ?? 'no clasificado',
    });
  }

  return { byContactId, uniqueHeadlines: unique.length, llmCalls };
}

module.exports = { classifyHeadlines, MODEL };
