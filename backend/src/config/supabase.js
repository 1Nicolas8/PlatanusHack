const { createClient } = require('@supabase/supabase-js');
const env = require('./env');

let client = null;

/**
 * Lazy singleton: evita crear el cliente en tiempo de import (rompería los
 * tests que no configuran SUPABASE_URL).
 */
function getSupabaseClient() {
  if (!client) {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no configuradas');
    }
    client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  }
  return client;
}

module.exports = { getSupabaseClient };
