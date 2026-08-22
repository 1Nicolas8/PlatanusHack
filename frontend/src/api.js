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

/**
 * GET /api/audiencia/resumen?limit=1..20
 * Respuesta: { totalContacts, totalArchetypes, topContacts: [{ nombre,
 * headline, arquetipo, sampleComment: string|null, ... }], ... }.
 */
export function fetchResumenAudiencia({ limit = 6 } = {}) {
  return request(`/api/audiencia/resumen?limit=${limit}`)
}

/**
 * POST /api/reaccion. Request: { copy: string (1..5000), corridaId?: string }.
 * Respuesta: { resumen, porArquetipo, reacciones: { likes, comentarios } }.
 */
export function fetchSimulacionReaccion({ copy, corridaId } = {}) {
  return request('/api/reaccion', {
    method: 'POST',
    body: JSON.stringify({ copy, ...(corridaId ? { corridaId } : {}) }),
  })
}

/**
 * POST /api/network/runs. Request: { profileUrl: URL, icp: string (mín. 3) }.
 * Respuesta 202: { runId, status, startedAt }; los campos opcionales de scraper
 * del schema backend son deliberadamente internos y no se exponen en esta UI.
 */
export function startNetworkRun({ profileUrl, icp }) {
  return request('/api/network/runs', {
    method: 'POST',
    body: JSON.stringify({ profileUrl, icp }),
  })
}

/**
 * GET /api/network/runs/:runId. Respuesta: { runId, status, finished,
 * startedAt, finishedAt, summary?, persisted?, written? }.
 * El backend actual no entrega el nombre ni foto del dueño del perfil: `profile`
 * se admite como extensión futura, pero la UI muestra un estado explícito hasta
 * que ese contrato exista. `photoUrl` de f3b0433 pertenece a contactos del actor.
 */
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
