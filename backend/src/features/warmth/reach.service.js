/**
 * Relevancia y alcance de cada contacto.
 *
 * La pregunta no es "quien me compra" sino "quien me amplifica". Un contacto
 * con alcance que comparte tu post vale mas que cien que solo lo miran.
 *
 * Lo importante es de donde sale cada señal, porque no todas valen igual:
 *
 *   OBSERVADO   comentarios y compartidos: cuestan mas que un like y hacen
 *               que otros vean el post
 *   OBSERVADO   reacciones de fuera de la red en el MISMO post: alguien lo
 *               saco de tu circulo. Es la unica prueba de amplificacion real
 *               que tenemos sin scrapear perfiles
 *   DECLARADO   señales del headline (founder, head of, speaker): correlacionan
 *               con audiencia propia, pero son una heuristica, no una medicion
 *   AUSENTE     cantidad de seguidores. LinkedIn no la muestra en la lista de
 *               conexiones, solo en cada perfil. Traerla para 406 contactos son
 *               406 visitas de perfil. Cuando exista el dato, entra por
 *               `followers` y desplaza a la heuristica.
 */

const AMPLIFY_WEIGHTS = { compartido: 6, share: 6, comentario: 3, comment: 3, like: 1 };

/** Marcadores de audiencia propia en el headline. Heuristica declarada. */
const AUTHORITY_PATTERNS = [
  { re: /\b(founder|co-?founder|ceo|cto|cpo|owner)\b/i, weight: 25, label: 'fundador o C-level' },
  { re: /\b(head of|director|vp|vice president)\b/i, weight: 15, label: 'liderazgo' },
  { re: /\b(speaker|autor|author|creator|host|podcast)\b/i, weight: 20, label: 'crea contenido' },
  { re: /\b(profesor|professor|docente|mentor)\b/i, weight: 12, label: 'divulga' },
  { re: /\b(investor|inversor|partner|vc)\b/i, weight: 18, label: 'inversor' },
];

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

function authorityFromHeadline(headline) {
  const matched = AUTHORITY_PATTERNS.filter((p) => p.re.test(headline || ''));
  return {
    score: clamp(matched.reduce((s, m) => s + m.weight, 0), 0, 100),
    signals: matched.map((m) => m.label),
  };
}

/**
 * Amplificacion observada.
 *
 * Se le atribuye a los contactos que interactuaron con un post al que despues
 * llego gente de fuera de la red. No prueba causalidad — no sabemos quien
 * exactamente lo saco del circulo — y por eso se reparte entre todos los que
 * interactuaron en ese post, ponderado por el peso de su interaccion.
 */
function computeAmplification({ reactions, connectionIds }) {
  const inNetwork = new Set(connectionIds.map(String));
  const byPost = new Map();

  for (const r of reactions) {
    const post = String(r.postId);
    if (!byPost.has(post)) byPost.set(post, { inside: [], outsideCount: 0 });
    const bucket = byPost.get(post);

    const key = r.conexionId === null || r.conexionId === undefined ? null : String(r.conexionId);
    if (key && inNetwork.has(key)) bucket.inside.push({ id: key, weight: AMPLIFY_WEIGHTS[String(r.tipo).toLowerCase()] ?? 1 });
    else bucket.outsideCount += 1;
  }

  const credit = new Map();
  for (const { inside, outsideCount } of byPost.values()) {
    if (outsideCount === 0 || inside.length === 0) continue;
    const totalWeight = inside.reduce((s, i) => s + i.weight, 0) || 1;
    for (const i of inside) {
      credit.set(i.id, (credit.get(i.id) ?? 0) + (outsideCount * i.weight) / totalWeight);
    }
  }
  return credit;
}

/**
 * Ordena la red por relevancia.
 *
 * @param {object[]} connections  { id, nombre, headline, followers? }
 * @param {object[]} reactions    { conexionId, postId, tipo }
 */
function rankByReach({ connections, reactions = [] }) {
  const amplification = computeAmplification({
    reactions,
    connectionIds: connections.map((c) => c.id),
  });

  const engagementWeight = new Map();
  for (const r of reactions) {
    const key = r.conexionId === null || r.conexionId === undefined ? null : String(r.conexionId);
    if (!key) continue;
    engagementWeight.set(
      key,
      (engagementWeight.get(key) ?? 0) + (AMPLIFY_WEIGHTS[String(r.tipo).toLowerCase()] ?? 1),
    );
  }

  const maxAmplification = Math.max(1, ...amplification.values());
  const maxEngagement = Math.max(1, ...engagementWeight.values());
  const hasFollowers = connections.some((c) => Number(c.followers) > 0);
  const maxFollowers = Math.max(1, ...connections.map((c) => Number(c.followers) || 0));

  const scored = connections.map((connection) => {
    const key = String(connection.id);
    const authority = authorityFromHeadline(connection.headline);
    const amp = amplification.get(key) ?? 0;
    const eng = engagementWeight.get(key) ?? 0;
    const followers = Number(connection.followers) || null;

    // Cuando hay seguidores reales pesan mas que la heuristica del headline,
    // porque son medicion y no inferencia.
    const audience = hasFollowers && followers
      ? (followers / maxFollowers) * 100
      : authority.score;

    const score =
      audience * 0.4 + (amp / maxAmplification) * 100 * 0.35 + (eng / maxEngagement) * 100 * 0.25;

    return {
      connectionId: connection.id,
      nombre: connection.nombre,
      headline: connection.headline ?? '',
      followers,
      audienceScore: Number(audience.toFixed(1)),
      authoritySignals: authority.signals,
      amplification: Number(amp.toFixed(2)),
      engagementWeight: eng,
      reachScore: Number(score.toFixed(1)),
      audienceSource: hasFollowers && followers ? 'seguidores' : 'headline',
    };
  });

  return {
    contacts: scored.sort((a, b) => b.reachScore - a.reachScore),
    summary: {
      total: connections.length,
      withFollowers: connections.filter((c) => Number(c.followers) > 0).length,
      withAmplification: amplification.size,
      followersAvailable: hasFollowers,
      note: hasFollowers
        ? 'Alcance basado en seguidores reales.'
        : 'Sin cantidad de seguidores cargada: el alcance se estima desde señales del headline. Es una heuristica declarada, no una medicion.',
    },
  };
}

module.exports = { rankByReach, authorityFromHeadline, computeAmplification, AMPLIFY_WEIGHTS };
