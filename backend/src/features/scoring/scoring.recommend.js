const Anthropic = require('@anthropic-ai/sdk');
const z = require('zod/v4');
const { zodOutputFormat } = require('@anthropic-ai/sdk/helpers/zod');
const env = require('../../config/env');
const AppError = require('../../shared/errors/AppError');

/**
 * SIM-19 — recomendacion accionable y version reescrita.
 *
 * El modelo NO opina libremente sobre como mejorar el post. Recibe los gaps ya
 * medidos —que arquetipo puntuo bajo, cuanto, y con que justificacion— y su
 * unica tarea es escribir una version que ataque esos gaps concretos.
 *
 * La diferencia importa: preguntarle "como mejoro este post" produce los
 * consejos de LinkedIn de siempre —usa numeros, contá una historia, agregá un
 * CTA— que valen lo mismo para cualquier post del mundo. Anclarlo a los gaps
 * medidos produce un cambio que se puede verificar volviendo a simular.
 */

const MODEL = 'claude-haiku-4-5';

const RecommendationSchema = z.object({
  change: z.string(),
  rationale: z.string(),
  rewrittenPost: z.string(),
  targetsArchetypes: z.array(z.string()),
});

async function buildRecommendation({ explanation, winningPost, icp, client = null }) {
  if (!env.ANTHROPIC_API_KEY) throw AppError.badRequest('ANTHROPIC_API_KEY no configurada');
  if (!explanation.winner) {
    return {
      change: null,
      note: 'Sin ganador declarable no hay una base sobre la cual recomendar. Recomendar igual seria adivinar.',
    };
  }

  const anthropic = client ?? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  // Los arquetipos donde la variante ganadora TODAVIA puntua bajo: ahi esta el
  // margen de mejora que queda, y es lo unico sobre lo que tiene sentido pedir
  // un cambio.
  const gaps = explanation.tradeoff.map(
    (t) => `- ${t.archetype} (${t.sharePct}% de la red): la otra variante le hablaba mejor, diferencia de ${t.gap} puntos.`,
  );
  const strengths = explanation.drivers.map(
    (d) => `- ${d.label} (${d.sharePct}%, ${d.population} personas): puntua ${d.scoreWinner}. Motivo: ${d.reason}`,
  );

  const response = await anthropic.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    system:
      'Reescribís una publicación de LinkedIn para mejorarla.\n\n' +
      'Recibís un diagnóstico MEDIDO: qué arquetipos de audiencia responden bien al post y ' +
      'cuáles no, con la razón concreta en cada caso.\n\n' +
      'Reglas:\n' +
      '- El cambio tiene que atacar un gap concreto del diagnóstico. Nada de consejos ' +
      'genéricos de LinkedIn que valdrían para cualquier post.\n' +
      '- NO rompas lo que ya funciona: los arquetipos que puntúan alto lo hacen por una razón ' +
      'que está escrita, y esa razón tiene que sobrevivir a la reescritura.\n' +
      '- La versión reescrita es un post completo y publicable, no un esquema ni una lista de ' +
      'sugerencias.\n' +
      '- Mantené la voz del original. Estás editando a una persona, no escribiendo de cero.\n' +
      '- change es una sola frase con el cambio concreto. rationale explica qué gap ataca.',
    messages: [
      {
        role: 'user',
        content:
          `${icp ? `ICP: ${icp}\n\n` : ''}` +
          `Publicación ganadora:\n"""${winningPost}"""\n\n` +
          `LO QUE YA FUNCIONA (no romper):\n${strengths.join('\n')}\n\n` +
          `DONDE QUEDA MARGEN:\n${gaps.length ? gaps.join('\n') : '- Sin gaps medidos: buscá el arquetipo grande con menor puntaje.'}\n\n` +
          'Escribí una versión mejorada.',
      },
    ],
    output_config: { format: zodOutputFormat(RecommendationSchema) },
  });

  if (!response.parsed_output) throw AppError.badRequest('El modelo no devolvió una recomendación válida');
  return { ...response.parsed_output, basedOn: { strengths: strengths.length, gaps: gaps.length } };
}

/**
 * Vuelve a simular la version reescrita contra el original.
 *
 * Sin esto la recomendacion es un consejo: suena bien y nadie sabe si sirve.
 * Con esto es una hipotesis verificada — o descartada, que tambien es un
 * resultado y hay que reportarlo tal cual.
 */
async function verifyRecommendation({ original, rewritten, archetypes, agents, icp, comparePosts }) {
  const comparison = await comparePosts({
    postA: rewritten,
    postB: original,
    archetypes,
    agents,
    icp,
  });

  const improved = comparison.winner === 'A';

  return {
    improved,
    decisive: comparison.winner !== null,
    original: comparison.b,
    rewritten: comparison.a,
    delta: comparison.deltaCommercialIntent,
    verdict: improved
      ? 'La versión reescrita supera al original en la simulación.'
      : comparison.winner === null
        ? 'La reescritura no mueve la aguja: la diferencia está dentro del ruido.'
        : 'La reescritura EMPEORA el original. No la publiques.',
  };
}

module.exports = { buildRecommendation, verifyRecommendation, MODEL };
