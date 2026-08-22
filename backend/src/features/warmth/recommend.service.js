/**
 * SIM-54 — a quien cultivar y con que.
 *
 * El diagnostico ya dice quien te amplificaria y no te da bola. Esto lo
 * convierte en trabajo concreto: a quien escribirle, en que orden y con que
 * enganche.
 *
 * Regla dura: la recomendacion sale de datos medidos de ESA persona. Si no hay
 * ninguna señal sobre alguien, no se recomienda — se dice que falta el dato.
 * Rellenar con consejos genericos convierte el producto en otro generador de
 * tips de LinkedIn.
 */

const DEFAULT_LIMIT = 15;

/** Marcadores del headline que dan un angulo de acercamiento concreto. */
const ANGLES = [
  { re: /\b(founder|co-?founder|ceo)\b/i, angle: 'construye algo propio' },
  { re: /\b(head of|director|vp)\b/i, angle: 'lidera un equipo' },
  { re: /\b(speaker|podcast|creator|autor|author)\b/i, angle: 'produce contenido' },
  { re: /\b(mentor|profesor|professor|docente)\b/i, angle: 'ensena' },
  { re: /\b(investor|inversor|vc|partner)\b/i, angle: 'invierte' },
];

function angleFor(headline) {
  return ANGLES.find((a) => a.re.test(headline || ''))?.angle ?? null;
}

/**
 * Por que vale la pena esta persona, con los numeros que lo sostienen.
 *
 * Nunca dice "es influyente": dice cuanto alcance tiene, de donde sale ese
 * numero, y cuantas veces interactuo. El founder puede discutir el dato.
 */
function buildReason(node) {
  const parts = [];

  if (node.reach.amplification > 0) {
    parts.push(
      `cuando interactua, tu post sale de tu red: se le atribuyen ${node.reach.amplification.toFixed(1)} exposiciones externas`,
    );
  }
  if (node.reach.signals.length > 0) {
    parts.push(`su headline indica que ${node.reach.signals.join(' y ')}`);
  }
  if (node.heat.interactions > 0) {
    parts.push(`interactuo ${node.heat.interactions} ${node.heat.interactions === 1 ? 'vez' : 'veces'} con vos`);
  }

  return parts;
}

/**
 * @param {object[]} nodes  salida de buildNetworkMap
 */
function recommendWhoToCultivate({ nodes, limit = DEFAULT_LIMIT }) {
  const candidates = nodes.filter((n) => n.actionable);

  const scored = candidates
    .map((node) => {
      const reasons = buildReason(node);
      const angle = angleFor(node.headline);

      // Sin ninguna señal medida no hay nada sobre lo cual recomendar.
      if (reasons.length === 0 && !angle) return null;

      const previousContent = node.posts ?? [];

      return {
        id: node.id,
        nombre: node.nombre,
        headline: node.headline,
        reachScore: node.reach.score,
        reachSource: node.reach.source,
        interactions: node.heat.interactions,
        why: reasons,
        angle,
        /**
         * El enganche concreto. Si nunca interactuo se dice, en vez de inventar
         * que le gusto algo tuyo.
         */
        hook:
          previousContent.length > 0
            ? {
                type: 'contenido-previo',
                detail: `Ya interactuo con: "${previousContent[0].texto}"`,
                postId: previousContent[0].id,
              }
            : {
                type: 'sin-señal',
                detail:
                  'Nunca interactuo con tu contenido. No hay dato para personalizar el acercamiento; el angulo sale solo de su perfil.',
              },
        priority: Number((node.reach.score * (node.heat.interactions > 0 ? 1.3 : 1)).toFixed(1)),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.priority - a.priority);

  const withHook = scored.filter((s) => s.hook.type === 'contenido-previo').length;

  return {
    recommendations: scored.slice(0, limit),
    summary: {
      actionableTotal: candidates.length,
      recommendable: scored.length,
      skippedNoSignal: candidates.length - scored.length,
      withPreviousContent: withHook,
      note:
        scored.length === 0
          ? 'No hay a quien recomendar todavia: sin alcance medido ni señales de perfil no hay base.'
          : `${withHook} de ${scored.length} ya interactuaron con algun contenido tuyo: a esos se les puede escribir con un enganche concreto.`,
    },
  };
}

module.exports = { recommendWhoToCultivate, buildReason, angleFor };
