const llmClient = require('./scoring.llm-client');

/**
 * SIM-12 / SIM-13 — motor de predicción.
 *
 * La prediccion sale de multiplicar dos cosas que vienen de fuentes distintas:
 *
 *   tasa base      del HISTORIAL — cuanto reacciona esta persona a cualquier
 *                  cosa que publiques (calibrada por Bryan sobre posts 1-7)
 *   modificador    del CONTENIDO — cuanto mueve la aguja ESTE post concreto,
 *                  puntuado por el LLM contra cada arquetipo
 *
 * Separarlas importa: la tasa base es dato observado y el modificador es
 * juicio del modelo. Mezclarlas en un solo numero haria imposible saber cual
 * de las dos falla cuando la prediccion no acierta.
 *
 * Los arquetipos pueden venir de dos fuentes y el motor no asume ninguna:
 *   'red'  — clusters de tus conexiones reales. Validable contra el historial.
 *   'icp'  — derivados de una descripcion de mercado. No validable, pero es
 *            la pregunta que el producto promete responder.
 */

/** El modificador centra el score en 1: 50/100 no cambia nada, 100 duplica. */
const MODIFIER_FLOOR = 0.1;
const MODIFIER_CEILING = 2.5;

function toModifier(score) {
  const raw = score / 50;
  return Math.min(MODIFIER_CEILING, Math.max(MODIFIER_FLOOR, raw));
}

const mean = (values) => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0);

/**
 * Puntua un post y predice la reaccion de cada agente.
 *
 * @param {object}   params
 * @param {string}   params.post
 * @param {object[]} params.archetypes  { id, label, awareness }
 * @param {object[]} params.agents      { id, archetypeId, tasaCalibrada }
 * @param {'red'|'icp'} params.source   de donde salieron los arquetipos
 */
async function predictPost({ post, archetypes, agents, icp, source = 'red', scorer = llmClient }) {
  const scores = await scorer.scorePost({ post, archetypes, icp });
  const scoreById = new Map(scores.map((s) => [String(s.archetypeId), s]));

  const predictions = agents.map((agent) => {
    const score = scoreById.get(String(agent.archetypeId));
    // Un arquetipo sin puntuar no se asume neutro: se marca, porque significa
    // que el modelo no devolvio lo que se le pidio.
    // Dos modificadores independientes: uno predice si reacciona, el otro si
    // se acerca a comprar. Un mismo post puede ser alto en uno y bajo en otro.
    const socialModifier = score ? toModifier(score.socialEngagement) : null;
    const commercialModifier = score ? toModifier(score.commercialIntent) : null;
    const modifier = socialModifier;
    const base = Number(agent.tasaCalibrada ?? 0);

    return {
      agentId: agent.id,
      archetypeId: agent.archetypeId,
      baseRate: base,
      modifier,
      // probability = probabilidad de que REACCIONE. Es lo que se valida contra
      // las reacciones reales, porque es lo unico de lo que hay dato.
      probability: socialModifier === null ? null : Math.min(1, base * socialModifier),
      commercialProbability:
        commercialModifier === null ? null : Math.min(1, base * commercialModifier),
      scored: socialModifier !== null,
    };
  });

  const scored = predictions.filter((p) => p.scored);

  return {
    source,
    archetypeScores: scores,
    predictions,
    summary: {
      agents: agents.length,
      unscoredAgents: predictions.length - scored.length,
      expectedReactions: Number(scored.reduce((s, p) => s + p.probability, 0).toFixed(2)),
      avgProbability: Number(mean(scored.map((p) => p.probability)).toFixed(4)),
      avgCommercialIntent: Number(mean(scores.map((s) => s.commercialIntent)).toFixed(1)),
      /**
       * Atencion comercialmente relevante: alcance PONDERADO por intencion.
       * Ni el alcance solo — un post viral entre quienes no compran no sirve —
       * ni la intencion sola, que descarta que un post llegue al doble de gente.
       */
      commerciallyRelevantReach: Number(
        scored.reduce((sum, p) => sum + (p.commercialProbability ?? 0), 0).toFixed(2),
      ),
      avgSocialEngagement: Number(mean(scores.map((s) => s.socialEngagement)).toFixed(1)),
      // Si el modelo puntuo todos los arquetipos casi igual, no esta
      // discriminando y la comparacion A/B no va a significar nada.
      scoreSpread: Number(
        (Math.max(...scores.map((s) => s.socialEngagement)) - Math.min(...scores.map((s) => s.socialEngagement))).toFixed(1),
      ),
    },
  };
}

/**
 * SIM-17 — compara dos variantes.
 *
 * Gana por ATENCION COMERCIALMENTE RELEVANTE: alcance ponderado por intencion.
 * Ni el alcance solo, que premia la viralidad vacia, ni la intencion promedio,
 * que descarta que un post llegue al doble de las personas correctas.
 */
async function comparePosts({ postA, postB, archetypes, agents, icp, source = 'red', scorer = llmClient }) {
  const [a, b] = await Promise.all([
    predictPost({ post: postA, archetypes, agents, icp, source, scorer }),
    predictPost({ post: postB, archetypes, agents, icp, source, scorer }),
  ]);

  // Se compara alcance comercialmente relevante, no intencion promedio: dos
  // posts pueden tener la misma intencion y uno llegar al doble de gente.
  const metricA = a.summary.commerciallyRelevantReach;
  const metricB = b.summary.commerciallyRelevantReach;
  const deltaIntent = metricA - metricB;

  // El ruido es relativo a la magnitud: 10% del mayor de los dos.
  const noise = Math.max(metricA, metricB) * 0.1;

  // Con agentes muestreados dos posts casi iguales dan numeros distintos por
  // azar. Declarar ganador ahi seria inventar una diferencia que no existe.
  const decisive = Math.abs(deltaIntent) > noise;

  return {
    a: a.summary,
    b: b.summary,
    metric: 'commerciallyRelevantReach',
    archetypeScores: { a: a.archetypeScores, b: b.archetypeScores },
    deltaCommercialIntent: Number(deltaIntent.toFixed(2)),
    noiseThreshold: Number(noise.toFixed(2)),
    winner: decisive ? (deltaIntent > 0 ? 'A' : 'B') : null,
    verdict: decisive
      ? `Gana ${deltaIntent > 0 ? 'A' : 'B'} por alcance comercialmente relevante.`
      : 'La diferencia entre A y B está dentro del ruido de la simulación. No hay ganador declarable.',
  };
}

module.exports = { predictPost, comparePosts, toModifier };
