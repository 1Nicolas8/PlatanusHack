/**
 * Construcción del grafo y análisis de oportunidad.
 *
 * Lo que es dato real y lo que es modelo, explícito:
 *
 *   nodos          REAL      cada contacto de tu red, con headline y empresa
 *   es ICP         DERIVADO  clasificación del headline contra tu ICP
 *   aristas        REAL si se pasan por `realEdges`, si no MODELO por homofilia
 *   2do grado      ESTIMADO  supuesto de tamaño medio de red por contacto
 *
 * Sobre las aristas: LinkedIn SÍ deja ver la lista de conexiones de un contacto
 * de primer grado — el default de visibilidad es "tus conexiones", no "solo yo".
 * El límite real está en el tercer grado. Así que las aristas hasta dos saltos
 * son obtenibles, y por eso `realEdges` existe: cuando el dato observado entra,
 * reemplaza al modelo y los contactos con aristas reales no reciben estimadas.
 *
 * Mientras no haya dato observado se modela por homofilia profesional, y el
 * reporte informa qué fracción del grafo es real (`realRatio`). Un número
 * modelado presentado como observado sería mentir; declararlo, no.
 */

/** RNG con semilla — el mismo grafo en cada corrida. */
function createRng(seed) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < String(seed).length; i += 1) {
    h ^= String(seed).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let state = h >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STOPWORDS = new Set([
  'at', 'the', 'of', 'and', 'a', 'en', 'de', 'y', 'el', 'la', 'para', 'con',
  'director', 'senior', 'lead', 'head',
]);

/** Tokens significativos del headline, para medir cercanía profesional. */
function tokenize(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/** Normaliza filas de cualquier fuente (export oficial, actor, CSV a mano). */
function normalizeConnections(rows, maxNodes) {
  return rows.slice(0, maxNodes).map((row, index) => {
    const name =
      row.name ||
      [row.firstName ?? row['First Name'], row.lastName ?? row['Last Name']]
        .filter(Boolean)
        .join(' ')
        .trim() ||
      `contacto-${index}`;

    const company = row.company ?? row.Company ?? row.currentCompany ?? '';
    const position = row.position ?? row.Position ?? row.currentTitle ?? '';

    return {
      id: `c${index}`,
      name,
      headline: row.headline || [position, company].filter(Boolean).join(' at '),
      company,
      position,
      location: row.location ?? row.Location ?? '',
      url: row.url ?? row.URL ?? row.profileUrl ?? '',
      connectedOn: row.connectedOn ?? row['Connected On'] ?? '',
    };
  });
}

/**
 * Grafo de cercanía profesional.
 *
 * Dos contactos con headlines parecidos, o de la misma empresa, tienen más
 * chance de conocerse. No es una certeza — es la homofilia profesional, que es
 * el fenómeno mejor documentado de las redes laborales.
 */
function buildGraph(contacts, { seed, avgDegree = 10, similarityFloor = 0.2, realEdges = [] }) {
  const rng = createRng(`${seed}:edges`);
  const tokens = contacts.map((c) => tokenize(c.headline));
  const adjacency = new Map(contacts.map((c) => [c.id, new Set()]));

  // Aristas REALES primero. Si vienen, mandan: el modelo solo rellena lo que
  // falta. Un contacto que ya tiene conexiones observadas no recibe modeladas,
  // así el dato real nunca queda contaminado por la estimación.
  const byUrl = new Map(contacts.filter((c) => c.url).map((c) => [c.url, c.id]));
  const byName = new Map(contacts.map((c) => [c.name.toLowerCase(), c.id]));
  const resolve = (ref) => byUrl.get(ref) ?? byName.get(String(ref).toLowerCase()) ?? null;

  const hasRealEdges = new Set();
  let realCount = 0;
  for (const [from, to] of realEdges) {
    const a = resolve(from);
    const b = resolve(to);
    if (!a || !b || a === b) continue;
    adjacency.get(a).add(b);
    adjacency.get(b).add(a);
    hasRealEdges.add(a);
    hasRealEdges.add(b);
    realCount += 1;
  }

  const attempts = Math.max(1, Math.round(avgDegree / 2));

  for (let i = 0; i < contacts.length; i += 1) {
    if (hasRealEdges.has(contacts[i].id)) continue;
    for (let n = 0; n < attempts; n += 1) {
      const j = Math.floor(rng() * contacts.length);
      if (i === j) continue;

      const sameCompany =
        contacts[i].company && contacts[i].company === contacts[j].company ? 0.6 : 0;
      const affinity = Math.min(1, jaccard(tokens[i], tokens[j]) + sameCompany);

      // similarityFloor: aun sin afinidad hay una chance mínima de conocerse.
      // Sin ese piso el grafo queda partido en islas por profesión y nada viaja.
      if (rng() < similarityFloor + affinity * (1 - similarityFloor)) {
        adjacency.get(contacts[i].id).add(contacts[j].id);
        adjacency.get(contacts[j].id).add(contacts[i].id);
      }
    }
  }

  let edges = 0;
  for (const [id, neighbours] of adjacency) {
    for (const other of neighbours) if (id < other) edges += 1;
  }

  return {
    adjacency,
    edges,
    realEdges: realCount,
    modeledEdges: edges - realCount,
    /** Qué fracción del grafo es dato observado y no estimación. */
    realRatio: edges > 0 ? realCount / edges : 0,
  };
}

/** Distancia en saltos desde el founder (que está conectado a todo su 1er grado). */
function hopDistances(contacts, graph) {
  const distance = new Map(contacts.map((c) => [c.id, 1]));
  let frontier = contacts.map((c) => c.id);
  let hop = 1;

  while (frontier.length > 0 && hop < 4) {
    const next = [];
    for (const id of frontier) {
      for (const neighbour of graph.adjacency.get(id) ?? []) {
        if (!distance.has(neighbour)) {
          distance.set(neighbour, hop + 1);
          next.push(neighbour);
        }
      }
    }
    frontier = next;
    hop += 1;
  }

  return distance;
}

/**
 * Reporte de oportunidad: ¿tu red aguanta para vender publicando?
 */
function analyzeOpportunity({ contacts, graph, icpByContactId, avgSecondDegree }) {
  const distance = hopDistances(contacts, graph);
  const icpContacts = contacts.filter((c) => icpByContactId.get(c.id)?.isIcp);

  const atOneHop = icpContacts.length;
  const icpRatio = contacts.length ? atOneHop / contacts.length : 0;

  // Estimación declarada, no scrapeada: si tu ICP es el X% de tu primer grado,
  // se asume una proporción similar en la red de tus contactos, descontando el
  // solapamiento propio de las redes profesionales.
  const OVERLAP_DISCOUNT = 0.35;
  const secondDegreeReach = Math.round(
    contacts.length * avgSecondDegree * (1 - OVERLAP_DISCOUNT),
  );
  const estimatedIcpAtTwoHops = Math.round(secondDegreeReach * icpRatio);

  const byCompany = {};
  for (const c of icpContacts) {
    const key = c.company || '(sin empresa)';
    byCompany[key] = (byCompany[key] || 0) + 1;
  }

  return {
    totalContacts: contacts.length,
    icpAtOneHop: atOneHop,
    icpRatio: Number(icpRatio.toFixed(4)),
    estimatedSecondDegreeReach: secondDegreeReach,
    estimatedIcpAtTwoHops,
    graphEdges: graph.edges,
    reachableWithinTwoHops: [...distance.values()].filter((d) => d <= 2).length,
    topIcpCompanies: Object.entries(byCompany)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([company, count]) => ({ company, count })),
    /**
     * El veredicto que le importa al founder. El umbral del 5% no es sagrado:
     * es el punto por debajo del cual publicar orgánico rinde tan poco que
     * conviene construir red antes que escribir contenido.
     */
    verdict:
      icpRatio >= 0.05
        ? 'Tu red tiene masa de ICP suficiente para que publicar convierta.'
        : 'Tu red casi no tiene a tu comprador. Publicar no va a convertir hasta que la construyas.',
    disclaimer:
      'Nodos y empresas son datos reales de tu red. Las aristas entre contactos son un modelo de homofilia profesional y el segundo grado es una estimacion: LinkedIn no publica quien de tu red conoce a quien.',
  };
}

module.exports = {
  createRng,
  tokenize,
  jaccard,
  normalizeConnections,
  buildGraph,
  hopDistances,
  analyzeOpportunity,
};
