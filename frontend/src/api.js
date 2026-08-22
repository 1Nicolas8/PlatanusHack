/**
 * Cliente del backend.
 *
 * La extracción de la red tarda minutos, así que el flujo es en dos tiempos:
 * se dispara la corrida y después se pregunta por su estado. No hay un solo
 * fetch que espere — se colgaría y la función serverless lo cortaría igual.
 */

const BASE_URL = import.meta.env.VITE_API_URL ?? 'https://platanus-hack-back.vercel.app'

const POLL_INTERVAL_MS = 5000
const POLL_TIMEOUT_MS = 10 * 60 * 1000

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.error ?? `El backend respondió ${response.status}`)
  }
  return payload.data
}

export function fetchResumenAudiencia({ perfil, limit = 6 } = {}) {
  const qs = new URLSearchParams({ perfil, limit: String(limit) })
  return request(`/api/audiencia/resumen?${qs}`)
}

export function fetchSimulacionReaccion({ copy, corridaId } = {}) {
  return request('/api/reaccion', {
    method: 'POST',
    body: JSON.stringify({ copy, ...(corridaId ? { corridaId } : {}) }),
  })
}

export function evaluatePanel({ perfil, copy, panel = 12, rondas = 2, iteraciones = 3, semilla } = {}) {
  return request('/api/panel/evaluaciones', {
    method: 'POST',
    body: JSON.stringify({ perfil, copy, panel, rondas, iteraciones, ...(semilla ? { semilla } : {}) }),
  })
}

export function fetchPanelRuns({ perfil, limite = 12 } = {}) {
  const qs = new URLSearchParams({ perfil, limite: String(limite) })
  return request(`/api/panel/corridas?${qs}`)
}

export function fetchPanelRun(corridaId) {
  return request(`/api/panel/corridas/${encodeURIComponent(corridaId)}`)
}

export function fetchProfileCoverage({ perfil } = {}) {
  const qs = new URLSearchParams({ perfil })
  return request(`/api/perfiles/cobertura?${qs}`)
}

/**
 * El mapa de la red: nodos con calor y alcance, plan de enriquecimiento y a
 * quien cultivar. Una sola llamada — el front no cruza tablas.
 */
/**
 * `perfil` no es opcional: el backend lo exige desde que las redes tienen
 * dueño. Sin el devolvia la red de otra persona como si fuera tuya.
 */
export function fetchNetworkMap({ perfil, enrichmentBudget } = {}) {
  const qs = new URLSearchParams({
    ...(perfil ? { perfil } : {}),
    ...(enrichmentBudget ? { enrichmentBudget } : {}),
  })
  return request(`/api/red/mapa?${qs}`)
}

/** Dispara la extracción. Vuelve enseguida con el id de la corrida. */
/**
 * El ICP es opcional: el analisis de red — alcance, relevancia, grafo — no lo
 * necesita. Solo la capa de clasificacion comercial, que ya no es el eje.
 */
/**
 * `connections` es el export oficial ya parseado. Cuando viaja, el backend no
 * encadena ningun scraper: no hace falta sesion de LinkedIn porque el dato lo
 * trae el propio usuario.
 */
export function startNetworkRun({ profileUrl, icp, connections }) {
  return request('/api/network/runs', {
    method: 'POST',
    body: JSON.stringify({
      profileUrl,
      ...(icp ? { icp } : {}),
      ...(connections?.length ? { connections } : {}),
    }),
  })
}

export function getNetworkRun(runId) {
  return request(`/api/network/runs/${runId}`)
}

/**
 * Espera a que la corrida termine, avisando del progreso.
 *
 * Tiene timeout propio: si el actor se cuelga, el usuario recibe un error claro
 * en vez de una pantalla girando para siempre.
 */
export async function waitForNetworkRun(runId, { onProgress } = {}) {
  const startedAt = Date.now()

  for (;;) {
    const run = await getNetworkRun(runId)
    onProgress?.(run)

    if (run.finished) {
      if (run.status !== 'SUCCEEDED') {
        throw new Error(`La extracción terminó en ${run.status}`)
      }
      return run
    }

    if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
      throw new Error('La extracción tardó más de 10 minutos. Revisá la corrida en Apify.')
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }
}

export { BASE_URL }
