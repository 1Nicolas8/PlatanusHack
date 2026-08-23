const { tokenize, jaccard } = require('./network');

/**
 * Plan de expansión al segundo grado.
 *
 * El presupuesto de expansión es el recurso escaso: cada contacto que expandís
 * cuesta plata y consume cuota de la cuenta. El primer grado no entra en este
 * presupuesto — sale del export y es gratis.
 *
 * La pregunta no es "cuántos expando" sino "cuáles". Tres criterios, en orden:
 *
 *   1. Densidad de ICP del cluster. Por homofilia, la red de un dueño de
 *      restaurante tiene más dueños de restaurante. Expandir un dev de tech
 *      cuando vendés a restaurantes gasta presupuesto en gente que no compra.
 *
 *   2. Reparto entre clusters, no concentrado. Cincuenta expansiones dentro de
 *      la misma empresa devuelven casi las mismas personas: sus redes se
 *      solapan. Repartir cubre más superficie con el mismo gasto.
 *
 *   3. Piso por cluster prometedor. Un cluster chico con 100% de ICP no puede
 *      quedar en cero solo por ser chico — ahí está la señal más pura.
 */

const DEFAULT_BUDGET = 50;
const DEFAULT_MIN_PER_CLUSTER = 2;
const CLUSTER_SIMILARITY = 0.34;

/** Agrupa el primer grado por cercanía profesional: empresa, o headline parecido. */
function clusterContacts(contacts) {
  const clusters = [];
  const tokens = new Map(contacts.map((c) => [c.id, tokenize(c.headline)]));

  for (const contact of contacts) {
    const found = clusters.find((cluster) => {
      const seed = cluster.members[0];
      if (contact.company && contact.company === seed.company) return true;
      return jaccard(tokens.get(contact.id), tokens.get(seed.id)) >= CLUSTER_SIMILARITY;
    });

    if (found) found.members.push(contact);
    else clusters.push({ id: `cl${clusters.length}`, members: [contact] });
  }

  return clusters;
}

/**
 * Reparte el presupuesto por resto mayor, ponderando tamaño por densidad de ICP.
 *
 * Un cluster de 100 contactos con 5% de ICP pesa lo mismo que uno de 10 con 50%:
 * cinco oportunidades cada uno. Eso es lo que se quiere — el peso es el ICP
 * esperado, no la cantidad de gente.
 */
function planExpansion({
  contacts,
  icpByContactId,
  degrees = {},
  budget = DEFAULT_BUDGET,
  minPerCluster = DEFAULT_MIN_PER_CLUSTER,
}) {
  const clusters = clusterContacts(contacts).map((cluster) => {
    const icpMembers = cluster.members.filter((m) => icpByContactId.get(m.id)?.isIcp);
    return {
      ...cluster,
      size: cluster.members.length,
      icpCount: icpMembers.length,
      icpRatio: icpMembers.length / cluster.members.length,
      // El peso es el ICP esperado del cluster, no su tamaño.
      weight: icpMembers.length,
    };
  });

  const promising = clusters.filter((c) => c.weight > 0);
  // Si nada clasificó como ICP, no se puede priorizar: se reparte parejo antes
  // que no expandir nada, porque quizá el ICP está mal escrito y conviene mirar.
  const pool = promising.length > 0 ? promising : clusters.map((c) => ({ ...c, weight: c.size }));

  const totalWeight = pool.reduce((sum, c) => sum + c.weight, 0) || 1;
  const exact = pool.map((c) => (c.weight / totalWeight) * budget);
  const quota = exact.map((value, i) => Math.min(pool[i].size, Math.max(minPerCluster, Math.floor(value))));

  // Ajuste: el piso por cluster puede pasarse del presupuesto. Se recorta desde
  // los clusters con menor densidad de ICP, nunca desde los más prometedores.
  let assigned = quota.reduce((s, q) => s + q, 0);
  const byDensityAsc = pool.map((c, i) => ({ i, ratio: c.icpRatio })).sort((a, b) => a.ratio - b.ratio);

  let guard = 0;
  while (assigned > budget && guard < 10000) {
    let trimmed = false;
    for (const { i } of byDensityAsc) {
      if (assigned <= budget) break;
      if (quota[i] > 0) { quota[i] -= 1; assigned -= 1; trimmed = true; }
    }
    if (!trimmed) break;
    guard += 1;
  }

  // Sobrante: al cluster con más ICP que todavía tenga miembros sin expandir.
  const byDensityDesc = [...byDensityAsc].reverse();
  guard = 0;
  while (assigned < budget && guard < 10000) {
    let added = false;
    for (const { i } of byDensityDesc) {
      if (assigned >= budget) break;
      if (quota[i] < pool[i].size) { quota[i] += 1; assigned += 1; added = true; }
    }
    if (!added) break;
    guard += 1;
  }

  const selected = [];
  pool.forEach((cluster, i) => {
    const ranked = [...cluster.members].sort((a, b) => {
      const icpDiff = Number(icpByContactId.get(b.id)?.isIcp) - Number(icpByContactId.get(a.id)?.isIcp);
      if (icpDiff !== 0) return icpDiff;
      // A igual condición, el más conectado: rinde más por expansión.
      return (degrees[b.id] ?? 0) - (degrees[a.id] ?? 0);
    });
    // Grado 2 explícito: esta gente NO te ve publicar. Solo llega a tu post si
    // alguien de tu primer grado lo comparte, y quien consuma este plan tiene
    // que poder distinguirlos de los contactos que sí te leen.
    selected.push(...ranked.slice(0, quota[i]).map((m) => ({ ...m, clusterId: cluster.id, grado: 2 })));
  });

  return {
    budget,
    toExpand: selected,
    clusters: pool.map((c, i) => ({
      clusterId: c.id,
      sample: c.members[0].headline,
      size: c.size,
      icpCount: c.icpCount,
      icpRatio: Number(c.icpRatio.toFixed(3)),
      quota: quota[i],
    })),
    coverage: {
      firstDegreeTotal: contacts.length,
      clustersFound: clusters.length,
      expanding: selected.length,
      /** Qué fracción del ICP de tu primer grado queda cubierta por el plan. */
      icpCovered: selected.filter((s) => icpByContactId.get(s.id)?.isIcp).length,
      icpTotal: contacts.filter((c) => icpByContactId.get(c.id)?.isIcp).length,
    },
  };
}

module.exports = { planExpansion, clusterContacts, DEFAULT_BUDGET };
