const env = require('../../config/env');

const PROBE_TIMEOUT_MS = 4000;

/**
 * Readiness de la base.
 *
 * Golpea la raíz de PostgREST en vez de una tabla concreta: el esquema todavía
 * no existe y un chequeo atado a una tabla obligaría a tocar este archivo cada
 * vez que cambie el modelo. Verifica lo que importa — que la URL responde y que
 * la credencial es válida.
 *
 * Nunca lanza: un chequeo de salud que tira una excepción es un chequeo roto.
 *
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
async function checkDatabase() {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, reason: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no configuradas' };
  }

  try {
    const response = await fetch(`${env.SUPABASE_URL}/rest/v1/`, {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });

    if (!response.ok) return { ok: false, reason: `PostgREST respondió ${response.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

module.exports = { checkDatabase };
