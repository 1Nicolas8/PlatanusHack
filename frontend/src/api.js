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

export function fetchResumenAudiencia({ limit = 6 } = {}) {
  return request(`/api/audiencia/resumen?limit=${limit}`)
}

export function fetchSimulacionReaccion({ copy, corridaId } = {}) {
  return request('/api/reaccion', {
    method: 'POST',
    body: JSON.stringify({ copy, ...(corridaId ? { corridaId } : {}) }),
  })
}

/** Dispara la extracción. Vuelve enseguida con el id de la corrida. */
/**
 * El ICP es opcional: el analisis de red — alcance, relevancia, grafo — no lo
 * necesita. Solo la capa de clasificacion comercial, que ya no es el eje.
 */
export function startNetworkRun({ profileUrl, icp }) {
  return request('/api/network/runs', {
    method: 'POST',
    body: JSON.stringify({ profileUrl, ...(icp ? { icp } : {}) }),
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
