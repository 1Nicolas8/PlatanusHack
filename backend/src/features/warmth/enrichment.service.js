/**
 * A quien enriquecer con historial laboral, educacion y lo que publica.
 *
 * Enriquecer es un scrape por persona: es lo mas caro del pipeline. Con 406
 * contactos, hacerlo a todos cuesta cientos de visitas de perfil y horas. Con
 * 50 bien elegidos se cubre casi todo el valor.
 *
 * El criterio no es "los primeros" sino donde el dato cambia una decision:
 *
 *   ACCIONABLES   alto alcance y cero interaccion. Son la lista de trabajo del
 *                 founder: saber que publican es lo unico que le permite
 *                 acercarse con algo concreto en vez de un mensaje generico.
 *   NUCLEO        ya interactuan. Enriquecerlos dice POR QUE, y eso se
 *                 generaliza al resto de la red.
 *   ALCANCE ALTO  el resto ordenado por alcance: son los que mas moverian la
 *                 aguja si alguna vez amplifican.
 *
 * Quien nunca interactuo y no tiene alcance queda ultimo a proposito: el dato
 * seria correcto y no cambiaria ninguna decision.
 */

const DEFAULT_BUDGET = 50;

/** Reparto del presupuesto entre los tres grupos, en ese orden de prioridad. */
const QUOTAS = [
  { key: 'accionable', share: 0.5 },
  { key: 'nucleo', share: 0.25 },
  { key: 'alcance', share: 0.25 },
];

function planEnrichment({ nodes, budget = DEFAULT_BUDGET, alreadyEnriched = [] }) {
  const done = new Set(alreadyEnriched.map(String));
  const pending = nodes.filter((n) => !done.has(String(n.id)));

  const buckets = {
    // Alto alcance, cero interaccion: la lista accionable.
    accionable: pending.filter((n) => n.actionable),
    // Ya interactuan y estan cerca del centro.
    nucleo: pending.filter((n) => !n.actionable && n.heat.ring <= 2),
    // El resto, por alcance.
    alcance: pending.filter((n) => !n.actionable && n.heat.ring > 2),
  };

  for (const list of Object.values(buckets)) {
    list.sort((a, b) => b.reach.score - a.reach.score);
  }

  const selected = [];
  const detail = [];

  // Primera pasada con la cuota de cada grupo.
  for (const { key, share } of QUOTAS) {
    const quota = Math.floor(budget * share);
    const taken = buckets[key].slice(0, quota);
    selected.push(...taken.map((n) => ({ ...n, reasonGroup: key })));
    detail.push({ group: key, available: buckets[key].length, taken: taken.length });
    buckets[key] = buckets[key].slice(quota);
  }

  // Sobrante: se reparte por prioridad en vez de perderse. Si no hay
  // accionables no tiene sentido dejar presupuesto sin usar.
  let remaining = budget - selected.length;
  for (const { key } of QUOTAS) {
    if (remaining <= 0) break;
    const extra = buckets[key].splice(0, remaining);
    selected.push(...extra.map((n) => ({ ...n, reasonGroup: key })));
    remaining -= extra.length;
    const row = detail.find((d) => d.group === key);
    if (row) row.taken += extra.length;
  }

  return {
    budget,
    toEnrich: selected.map((n) => ({
      id: n.id,
      nombre: n.nombre,
      headline: n.headline,
      group: n.reasonGroup,
      reachScore: n.reach.score,
      heatRing: n.heat.ring,
    })),
    byGroup: detail,
    coverage: {
      candidates: pending.length,
      selected: selected.length,
      alreadyEnriched: done.size,
      actionableCovered: selected.filter((n) => n.reasonGroup === 'accionable').length,
      actionableTotal: nodes.filter((n) => n.actionable).length,
    },
    note:
      selected.length === 0
        ? 'Nada que enriquecer: o el presupuesto es cero, o ya estan todos enriquecidos.'
        : 'Enriquecer es un scrape por persona. Este plan gasta el presupuesto donde el dato cambia una decision, no en los primeros de la lista.',
  };
}

module.exports = { planEnrichment, DEFAULT_BUDGET, QUOTAS };
