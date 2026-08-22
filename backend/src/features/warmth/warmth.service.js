/**
 * SIM-40 / SIM-41 — temperatura de cada contacto y cuadrante ICP x calor.
 *
 * "Cerca del centro" no puede ser contar reacciones. Tres cosas la definen:
 *
 *   peso        un comentario cuesta mucho mas que un like, y un compartido
 *               expone la red del otro
 *   recencia    quien interactuo hace diez posts y nada mas se esta enfriando
 *   oportunidad interacciones sobre los posts que esa persona PUDO ver desde
 *               que se conecto
 *
 * El tercero es el que casi todos se saltan, y es el que mas injusticia evita:
 * alguien conectado la semana pasada vio dos publicaciones. Juzgarlo en
 * absolutos lo manda al anillo frio aunque haya interactuado con todo lo que
 * tuvo enfrente.
 */

/** Un comentario es conversacion; un compartido presta audiencia; un like es un clic. */
const INTERACTION_WEIGHTS = { comentario: 4, comment: 4, compartido: 6, share: 6, like: 1 };
const DEFAULT_WEIGHT = 1;

/** Cada cuantos posts hacia atras la interaccion vale la mitad. */
const RECENCY_HALF_LIFE_POSTS = 5;

const RINGS = [
  { ring: 1, label: 'nucleo', minPercentile: 0.9 },
  { ring: 2, label: 'activo', minPercentile: 0.6 },
  { ring: 3, label: 'tibio', minPercentile: 0.25 },
  { ring: 4, label: 'periferia', minPercentile: 0 },
];
const COLD_RING = { ring: 5, label: 'frio', score: 0 };

const weightOf = (tipo) => INTERACTION_WEIGHTS[String(tipo).toLowerCase()] ?? DEFAULT_WEIGHT;

/**
 * Cuanto pesa una interaccion segun que tan reciente sea el post.
 * Se usa el orden cronologico y no la fecha porque el orden siempre existe;
 * la fecha, en los datos actuales, no.
 */
function recencyFactor(postOrder, latestOrder) {
  const distance = Math.max(0, latestOrder - postOrder);
  return 0.5 ** (distance / RECENCY_HALF_LIFE_POSTS);
}

/**
 * Cuantos posts pudo ver este contacto.
 *
 * Requiere que los posts tengan fecha. Si no la tienen — que es el caso hoy —
 * devuelve null y el llamador sabe que no puede normalizar por oportunidad.
 * Devolver el total como si todos hubieran visto todo seria inventar un dato.
 */
function opportunityCount(connection, posts) {
  const dated = posts.filter((p) => p.fecha);
  if (dated.length === 0 || !connection.fechaContacto) return null;

  const connectedAt = new Date(connection.fechaContacto).getTime();
  return dated.filter((p) => new Date(p.fecha).getTime() >= connectedAt).length;
}

/**
 * Calcula la temperatura de cada contacto.
 *
 * @param {object[]} connections  { id, nombre, headline, fechaContacto, arquetipoId }
 * @param {object[]} reactions    { conexionId, postId, tipo }
 * @param {object[]} posts        { id, ordenCronologico, fecha }
 */
function computeWarmth({ connections, reactions, posts }) {
  const postById = new Map(posts.map((p) => [String(p.id), p]));
  const latestOrder = posts.reduce((max, p) => Math.max(max, p.ordenCronologico ?? 0), 0);

  const byConnection = new Map(connections.map((c) => [String(c.id), []]));
  let outsideNetwork = 0;

  for (const reaction of reactions) {
    const key = reaction.conexionId === null || reaction.conexionId === undefined
      ? null
      : String(reaction.conexionId);

    // Quien interactua sin estar en tu red es una señal, no basura: es alguien
    // que te presta atencion sin que lo hayas conectado todavia.
    if (key === null || !byConnection.has(key)) { outsideNetwork += 1; continue; }

    const post = postById.get(String(reaction.postId));
    byConnection.get(key).push({
      weight: weightOf(reaction.tipo),
      recency: post ? recencyFactor(post.ordenCronologico ?? 0, latestOrder) : 1,
      postId: reaction.postId,
      tipo: reaction.tipo,
    });
  }

  const opportunityAvailable = posts.some((p) => p.fecha);
  // Sin ninguna reaccion cargada, "todos frios" seria una conclusion falsa: no
  // es que nadie interactuo, es que no sabemos. Hay que decirlo.
  const hasInteractionData = reactions.length > 0;

  const scored = connections.map((connection) => {
    const own = byConnection.get(String(connection.id)) ?? [];
    const rawScore = own.reduce((sum, i) => sum + i.weight * i.recency, 0);
    const opportunity = opportunityCount(connection, posts);

    return {
      connectionId: connection.id,
      nombre: connection.nombre,
      headline: connection.headline ?? '',
      arquetipoId: connection.arquetipoId ?? null,
      interactions: own.length,
      interactionTypes: own.reduce((acc, i) => {
        acc[i.tipo] = (acc[i.tipo] ?? 0) + 1;
        return acc;
      }, {}),
      postIds: [...new Set(own.map((i) => i.postId))],
      rawScore: Number(rawScore.toFixed(4)),
      opportunity,
      // Sin fechas de post no se puede dividir por oportunidad: se deja el crudo
      // y se avisa. Un score normalizado contra un denominador inventado seria
      // peor que uno sin normalizar.
      score: Number((opportunity && opportunity > 0 ? rawScore / opportunity : rawScore).toFixed(4)),
    };
  });

  const active = scored.filter((s) => s.score > 0).sort((a, b) => a.score - b.score);

  const withRings = scored.map((entry) => {
    if (entry.score <= 0) return { ...entry, ...COLD_RING, percentile: 0 };
    const percentile = active.findIndex((a) => a.connectionId === entry.connectionId) / active.length;
    const band = RINGS.find((r) => percentile >= r.minPercentile) ?? RINGS[RINGS.length - 1];
    return { ...entry, ring: band.ring, label: band.label, percentile: Number(percentile.toFixed(3)) };
  });

  return {
    contacts: withRings.sort((a, b) => b.score - a.score),
    summary: {
      totalContacts: connections.length,
      everInteracted: active.length,
      neverInteracted: connections.length - active.length,
      reactionsFromOutsideNetwork: outsideNetwork,
      opportunityNormalized: opportunityAvailable,
      hasInteractionData,
      note: !hasInteractionData
        ? 'No hay reacciones cargadas. Los contactos NO estan frios: no hay dato de interaccion. No uses esta salida para hablar de temperatura.'
        : opportunityAvailable
        ? 'Score normalizado por publicaciones visibles desde la fecha de contacto.'
        : 'Los posts no tienen fecha cargada: el score NO esta normalizado por oportunidad. Un contacto reciente aparece mas frio de lo que es.',
    },
    weights: { ...INTERACTION_WEIGHTS, recencyHalfLifePosts: RECENCY_HALF_LIFE_POSTS },
  };
}

/**
 * SIM-41 — cruza temperatura con ICP.
 *
 * El cuadrante que importa no es el caliente: es ICP-frio. Son oportunidades
 * reales que no estas activando. Y si no-ICP-caliente domina, eso explica por
 * que publicar no convierte — te aplaude gente que no te va a comprar.
 */
function buildQuadrants({ contacts, isIcp, warmRingThreshold = 3, hasInteractionData = true }) {
  const bucket = { icpWarm: [], icpCold: [], otherWarm: [], otherCold: [] };

  for (const contact of contacts) {
    const icp = Boolean(isIcp(contact));
    const warm = contact.ring <= warmRingThreshold && contact.score > 0;
    bucket[icp ? (warm ? 'icpWarm' : 'icpCold') : warm ? 'otherWarm' : 'otherCold'].push(contact);
  }

  const counts = Object.fromEntries(Object.entries(bucket).map(([k, v]) => [k, v.length]));
  const icpTotal = counts.icpWarm + counts.icpCold;
  const warmTotal = counts.icpWarm + counts.otherWarm;

  let verdict;
  // Sin datos de interaccion no se puede hablar de caliente ni frio: el
  // cuadrante degenera y cualquier veredicto seria inventado.
  if (!hasInteractionData) {
    return {
      counts,
      actionable: [],
      verdict:
        'Sin reacciones cargadas no se puede calcular temperatura. El analisis de red (ICP, saltos, cobertura) sigue siendo valido; el de calor no.',
      degraded: true,
    };
  }
  if (icpTotal === 0) {
    verdict = 'Tu red no tiene a tu comprador. Publicar no va a convertir hasta que la construyas.';
  } else if (warmTotal > 0 && counts.otherWarm / warmTotal > 0.8) {
    verdict =
      'Tu audiencia activa casi no es tu ICP. Te aplaude gente que no te va a comprar, y por eso publicar no convierte.';
  } else if (counts.icpCold > counts.icpWarm) {
    verdict = `Tenes ${counts.icpCold} contactos ICP sin activar. Son la lista accionable.`;
  } else {
    verdict = 'Tu ICP esta mayormente activado. El cuello de botella no es la red.';
  }

  return {
    counts,
    /** La lista que se convierte en trabajo: ICP que todavia no te da bola. */
    actionable: bucket.icpCold.slice(0, 50),
    verdict,
  };
}

module.exports = {
  computeWarmth,
  buildQuadrants,
  recencyFactor,
  INTERACTION_WEIGHTS,
  RINGS,
};
