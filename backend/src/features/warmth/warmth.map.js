/**
 * SIM-52 — arma el mapa de la red listo para dibujar.
 *
 * El front no deberia cruzar tablas ni decidir que es dato y que es estimacion.
 * Recibe nodos con dos ejes ya calculados y, en cada uno, de donde salio:
 *
 *   calor    cuanto interactua conmigo        OBSERVADO si hay reacciones
 *   alcance  cuanto amplifica cuando lo hace  OBSERVADO + heuristica de headline
 *
 * Marcar el origen no es prolijidad: un nodo con alcance heuristico no se puede
 * pintar igual que uno con seguidores reales, y el que dibuja necesita saberlo.
 */

const RING_LABELS = { 1: 'nucleo', 2: 'activo', 3: 'tibio', 4: 'periferia', 5: 'frio' };

/** Cuadrante accionable: mucho alcance y poca interaccion. */
const HIGH_REACH_PERCENTILE = 0.7;

function buildNetworkMap({ warmth, reach, posts = [] }) {
  const reachById = new Map(reach.contacts.map((c) => [String(c.connectionId), c]));
  const postById = new Map(posts.map((p) => [String(p.id), p]));

  const reachScores = reach.contacts.map((c) => c.reachScore).sort((a, b) => a - b);
  const highReachThreshold =
    reachScores[Math.floor(reachScores.length * HIGH_REACH_PERCENTILE)] ?? 0;

  const nodes = warmth.contacts.map((contact) => {
    const r = reachById.get(String(contact.connectionId));
    const reachScore = r?.reachScore ?? 0;

    return {
      id: contact.connectionId,
      nombre: contact.nombre,
      headline: contact.headline,
      photoUrl: contact.photoUrl ?? null,

      // Eje 1: distancia al centro.
      heat: {
        score: contact.score,
        ring: contact.ring,
        label: RING_LABELS[contact.ring] ?? 'frio',
        interactions: contact.interactions,
        source: warmth.summary.hasInteractionData ? 'observado' : 'sin-dato',
      },

      // Eje 2: tamaño del nodo.
      reach: {
        score: reachScore,
        amplification: r?.amplification ?? 0,
        signals: r?.authoritySignals ?? [],
        source: r?.audienceSource ?? 'headline',
        followers: r?.followers ?? null,
      },

      // Con que interactuó: alimenta el detalle al hacer click.
      posts: (contact.postIds ?? []).map((id) => ({
        id,
        texto: (postById.get(String(id))?.texto ?? '').slice(0, 120),
      })),

      /** El cuadrante que importa: te amplificaria y todavia no te da bola. */
      actionable: reachScore >= highReachThreshold && contact.score <= 0,
    };
  });

  const rings = Object.entries(RING_LABELS).map(([ring, label]) => ({
    ring: Number(ring),
    label,
    count: nodes.filter((n) => n.heat.ring === Number(ring)).length,
  }));

  return {
    nodes: nodes.sort((a, b) => b.reach.score - a.reach.score),
    rings,
    summary: {
      total: nodes.length,
      everInteracted: warmth.summary.everInteracted,
      neverInteracted: warmth.summary.neverInteracted,
      reactionsFromOutsideNetwork: warmth.summary.reactionsFromOutsideNetwork,
      withAmplification: reach.summary.withAmplification,
      actionable: nodes.filter((n) => n.actionable).length,
      heatSource: warmth.summary.hasInteractionData ? 'observado' : 'sin-dato',
      reachSource: reach.summary.followersAvailable ? 'seguidores' : 'heuristica',
      notes: [warmth.summary.note, reach.summary.note].filter(Boolean),
    },
  };
}

module.exports = { buildNetworkMap, RING_LABELS };
