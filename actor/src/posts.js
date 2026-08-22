const Anthropic = require('@anthropic-ai/sdk');
const z = require('zod/v4');
const { zodOutputFormat } = require('@anthropic-ai/sdk/helpers/zod');

const MODEL = 'claude-haiku-4-5';
const BATCH_SIZE = 12;

/** Tipos de contenido de la sección 19 del concepto. */
const POST_TYPES = [
  'founder-story',
  'educational',
  'product',
  'case-study',
  'pain-point',
  'industry-insight',
  'controversial',
  'other',
];

const PostAnalysisSchema = z.object({
  posts: z.array(
    z.object({
      index: z.number(),
      type: z.enum(POST_TYPES),
      hook: z.string(),
      opensWithProblem: z.boolean(),
      hasEvidence: z.boolean(),
      hasNumbers: z.boolean(),
      talksAboutProduct: z.boolean(),
      hasCta: z.boolean(),
      icpRelevance: z.number(),
      whatWorked: z.string(),
      whatFailed: z.string(),
    }),
  ),
});

/** Normaliza posts de cualquier fuente: export de LinkedIn, scraper, o carga a mano. */
function normalizePosts(rows) {
  return rows.map((row, index) => {
    const num = (...keys) => {
      for (const k of keys) {
        const v = row[k];
        if (v !== undefined && v !== null && v !== '') return Number(String(v).replace(/[^\d.-]/g, '')) || 0;
      }
      return 0;
    };

    const reactions = num('reactions', 'numLikes', 'likes', 'Reactions');
    const comments = num('comments', 'numComments', 'Comments');
    const shares = num('shares', 'numShares', 'reposts', 'Shares');
    const impressions = num('impressions', 'views', 'Impressions');

    return {
      index,
      text: row.text ?? row.content ?? row.ShareCommentary ?? row.commentary ?? '',
      date: row.date ?? row.postedAt ?? row.Date ?? row['Share Date'] ?? '',
      url: row.url ?? row.postUrl ?? row.ShareLink ?? '',
      reactions,
      comments,
      shares,
      impressions,
      /**
       * Engagement ponderado: un comentario cuesta mucho más que un like y una
       * conversación vale más que una reacción. Un compartido pesa todavía más
       * porque expone la red del otro. Los pesos son una convención declarada,
       * no una medición.
       */
      engagementScore: reactions + comments * 4 + shares * 6,
      engagementRate: impressions > 0 ? (reactions + comments * 4 + shares * 6) / impressions : null,
    };
  });
}

/** Pide al modelo que caracterice cada post: tipo, hook, evidencia, CTA. */
async function analyzePostContent({ posts, icp, apiKey }) {
  if (!apiKey || posts.length === 0) return { byIndex: new Map(), llmCalls: 0 };

  const client = new Anthropic({ apiKey });
  const byIndex = new Map();
  let llmCalls = 0;

  for (let i = 0; i < posts.length; i += BATCH_SIZE) {
    const batch = posts.slice(i, i + BATCH_SIZE);

    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 12000,
      system:
        'Analizás publicaciones de LinkedIn de un founder B2B.\n' +
        'Para cada una: qué tipo de contenido es, cuál es el hook (la primera línea que decide si ' +
        'alguien sigue leyendo), si abre con un problema o con el producto, si trae evidencia ' +
        'concreta o solo afirmaciones, si usa números.\n' +
        'icpRelevance de 0 a 100: cuánto le habla al ICP dado, no al público general.\n' +
        'whatWorked y whatFailed en una línea cada uno, citando algo puntual del texto. ' +
        'Si no falló nada evidente, decilo en vez de inventar una crítica.',
      messages: [
        {
          role: 'user',
          content:
            `ICP del founder: ${icp}\n\nPublicaciones:\n` +
            batch
              .map((p) => `--- index ${p.index} ---\n${String(p.text).slice(0, 1500)}`)
              .join('\n\n'),
        },
      ],
      output_config: { format: zodOutputFormat(PostAnalysisSchema) },
    });
    llmCalls += 1;

    for (const analysis of response.parsed_output?.posts ?? []) {
      byIndex.set(analysis.index, analysis);
    }
  }

  return { byIndex, llmCalls };
}

const mean = (values) => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0);

/**
 * Correlaciona las características del contenido con el resultado real.
 *
 * Esto es lo que separa el producto de un generador de contenido: no dice "los
 * posts con números funcionan mejor" en abstracto, dice qué funcionó en TU
 * cuenta, con TU audiencia.
 */
function analyzePostPerformance({ posts, analysisByIndex }) {
  const scored = posts
    .map((p) => ({ ...p, analysis: analysisByIndex.get(p.index) }))
    .filter((p) => p.analysis);

  if (scored.length === 0) return { sampleSize: 0, note: 'Sin posts analizados.' };

  const overall = mean(scored.map((p) => p.engagementScore));

  const byType = {};
  for (const post of scored) {
    const key = post.analysis.type;
    (byType[key] ??= []).push(post.engagementScore);
  }

  /** Cuánto rinde un rasgo frente al promedio de la cuenta. */
  const lift = (predicate) => {
    const withTrait = scored.filter((p) => predicate(p.analysis)).map((p) => p.engagementScore);
    const without = scored.filter((p) => !predicate(p.analysis)).map((p) => p.engagementScore);
    if (withTrait.length === 0 || without.length === 0) return null;
    const base = mean(without);
    return {
      withTrait: Math.round(mean(withTrait)),
      without: Math.round(base),
      lift: base > 0 ? Number((mean(withTrait) / base).toFixed(2)) : null,
      sample: withTrait.length,
    };
  };

  const ranked = [...scored].sort((a, b) => b.engagementScore - a.engagementScore);

  return {
    sampleSize: scored.length,
    averageEngagement: Math.round(overall),
    byType: Object.entries(byType)
      .map(([type, scores]) => ({
        type,
        posts: scores.length,
        avgEngagement: Math.round(mean(scores)),
        vsAverage: overall > 0 ? Number((mean(scores) / overall).toFixed(2)) : null,
      }))
      .sort((a, b) => b.avgEngagement - a.avgEngagement),
    traits: {
      opensWithProblem: lift((a) => a.opensWithProblem),
      hasEvidence: lift((a) => a.hasEvidence),
      hasNumbers: lift((a) => a.hasNumbers),
      talksAboutProduct: lift((a) => a.talksAboutProduct),
      hasCta: lift((a) => a.hasCta),
    },
    best: ranked.slice(0, 3).map((p) => ({
      date: p.date,
      type: p.analysis.type,
      hook: p.analysis.hook,
      engagementScore: p.engagementScore,
      whatWorked: p.analysis.whatWorked,
    })),
    worst: ranked.slice(-3).reverse().map((p) => ({
      date: p.date,
      type: p.analysis.type,
      hook: p.analysis.hook,
      engagementScore: p.engagementScore,
      whatFailed: p.analysis.whatFailed,
    })),
    /**
     * Advertencia deliberada. Con pocas publicaciones cualquier "lift" es ruido,
     * y presentar ruido como aprendizaje es peor que no decir nada.
     */
    confidence:
      scored.length >= 25
        ? 'alta'
        : scored.length >= 10
          ? 'media — los lifts son indicativos, no concluyentes'
          : 'baja — muy pocos posts, tratá los números como pistas y no como conclusiones',
  };
}

module.exports = { normalizePosts, analyzePostContent, analyzePostPerformance, POST_TYPES };
