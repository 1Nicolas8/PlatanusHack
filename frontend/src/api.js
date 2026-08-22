const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export async function fetchResumenAudiencia({ limit = 6 } = {}) {
  const response = await fetch(`${API_URL}/api/audiencia/resumen?limit=${limit}`)
  if (!response.ok) {
    throw new Error(`GET /api/audiencia/resumen -> ${response.status}`)
  }
  return response.json()
}

export async function fetchSimulacionReaccion({ copy, corridaId } = {}) {
  const response = await fetch(`${API_URL}/api/reaccion`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ copy, ...(corridaId ? { corridaId } : {}) }),
  })
  if (!response.ok) {
    throw new Error(`POST /api/reaccion -> ${response.status}`)
  }
  return response.json()
}
