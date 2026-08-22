/**
 * SIM-18 — explica por que gana una variante.
 *
 * Regla de diseño: la explicacion se DERIVA de las puntuaciones y de los
 * `reasoning` que el modelo ya escribio al evaluar. No se le vuelve a
 * preguntar "por que gano". Si se le preguntara, contestaria algo plausible
 * aunque los numeros dijeran otra cosa, y el usuario no tendria forma de
 * notarlo.
 *
 * Lo que se calcula acá es aritmetica sobre datos guardados. Verificable.
 */

/** Un arquetipo con 74 agentes mueve la aguja mas que uno con 3. */
function weightByPopulation(agents) {
  const counts = new Map();
  for (const agent of agents) {
    const key = String(agent.archetypeId);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * Cuanto aporto cada arquetipo a la diferencia entre A y B.
 *
 * El aporte es el delta de puntuacion multiplicado por cuanta gente representa
 * ese arquetipo. Un arquetipo que cambia mucho pero es minusculo no explica un
 * resultado, y presentarlo como si lo hiciera seria enganoso.
 */
function computeDrivers({ scoresA, scoresB, agents, archetypes, dimension = 'commercialIntent' }) {
  const counts = weightByPopulation(agents);
  const total = agents.length || 1;
  const labelById = new Map(archetypes.map((a) => [String(a.id), a.label]));
  const byIdB = new Map(scoresB.map((s) => [String(s.archetypeId), s]));

  return scoresA
    .map((a) => {
      const id = String(a.archetypeId);
      const b = byIdB.get(id);
      if (!b) return null;

      const population = counts.get(id) ?? 0;
      const share = population / total;
      const delta = a[dimension] - b[dimension];

      return {
        archetypeId: id,
        label: labelById.get(id) ?? id,
        population,
        share: Number(share.toFixed(3)),
        scoreA: a[dimension],
        scoreB: b[dimension],
        delta,
        // El aporte real a la diferencia global.
        contribution: Number((delta * share).toFixed(3)),
        reasoningA: a.reasoning,
        reasoningB: b.reasoning,
      };
    })
    .filter(Boolean)
    .sort((x, y) => Math.abs(y.contribution) - Math.abs(x.contribution));
}

/**
 * Arma la explicacion completa.
 *
 * @returns {{ winner, margin, drivers, whatWorked, whatFailed, coverage }}
 */
function explainComparison({ comparison, scoresA, scoresB, agents, archetypes }) {
  const winner = comparison.winner;

  if (!winner) {
    return {
      winner: null,
      headline: comparison.verdict,
      drivers: [],
      whatWorked: [],
      whatFailed: [],
      note: 'Sin ganador declarable no hay nada que explicar. Explicar un empate seria inventar una causa.',
    };
  }

  const drivers = computeDrivers({ scoresA, scoresB, agents, archetypes });
  const favouringWinner = drivers.filter((d) => (winner === 'A' ? d.delta > 0 : d.delta < 0));
  const againstWinner = drivers.filter((d) => (winner === 'A' ? d.delta < 0 : d.delta > 0));

  const totalContribution = drivers.reduce((s, d) => s + Math.abs(d.contribution), 0) || 1;
  const top = favouringWinner.slice(0, 3);
  const explained = top.reduce((s, d) => s + Math.abs(d.contribution), 0) / totalContribution;

  return {
    winner,
    margin: comparison.deltaCommercialIntent,
    /** Los arquetipos que realmente explican el resultado, con su peso. */
    drivers: top.map((d) => ({
      label: d.label,
      population: d.population,
      sharePct: Math.round(d.share * 100),
      scoreWinner: winner === 'A' ? d.scoreA : d.scoreB,
      scoreLoser: winner === 'A' ? d.scoreB : d.scoreA,
      reason: winner === 'A' ? d.reasoningA : d.reasoningB,
    })),
    /** Que salio bien en la ganadora, citando el juicio guardado. */
    whatWorked: top.map((d) => ({
      archetype: d.label,
      evidence: winner === 'A' ? d.reasoningA : d.reasoningB,
    })),
    /** Que esta fallando en la perdedora. Sin esto solo se copia al ganador. */
    whatFailed: favouringWinner.slice(0, 3).map((d) => ({
      archetype: d.label,
      evidence: winner === 'A' ? d.reasoningB : d.reasoningA,
      gap: Math.abs(d.delta),
    })),
    /** Arquetipos donde la perdedora era MEJOR: lo que se pierde al elegir. */
    tradeoff: againstWinner.slice(0, 2).map((d) => ({
      archetype: d.label,
      sharePct: Math.round(d.share * 100),
      gap: Math.abs(d.delta),
    })),
    coverage: {
      explainedShare: Number(explained.toFixed(2)),
      note:
        explained < 0.5
          ? 'Los tres arquetipos principales explican menos de la mitad de la diferencia: el resultado esta repartido y no hay una causa dominante.'
          : 'Los tres arquetipos principales explican la mayor parte de la diferencia.',
    },
  };
}

module.exports = { explainComparison, computeDrivers };
