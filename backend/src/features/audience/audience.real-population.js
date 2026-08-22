const { getSupabaseClient } = require('../../config/supabase');

const DEFAULT_SEED = 'linkedin-real-population';
const DEFAULT_SHARE_FACTOR = 0.25;

async function select(query, label) {
  const { data, error } = await query;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

function createCalibratedShareProbability(factor = DEFAULT_SHARE_FACTOR) {
  if (!Number.isFinite(factor) || factor < 0) {
    throw new Error(`El factor de propagación debe ser un número no negativo; se recibió ${factor}.`);
  }

  return (agent) => Math.min(1, agent.tasaCalibrada * factor);
}

async function loadRealPopulation({
  corridaId: providedCorridaId,
  corrida_id: databaseCorridaId,
  seed = DEFAULT_SEED,
  supabase = getSupabaseClient(),
}) {
  const corridaId = providedCorridaId ?? databaseCorridaId;
  if (typeof corridaId !== 'string' || corridaId.trim() === '') {
    throw new Error('corridaId (o corrida_id) es obligatorio para cargar las tasas calibradas.');
  }

  const [agents, archetypes, calibrations] = await Promise.all([
    select(
      supabase
        .from('agentes_simulacion')
        .select('id,conexion_id,arquetipo_id,nivel,reacciones_observadas')
        .order('id'),
      'No se pudieron leer los agentes reales',
    ),
    select(
      supabase.from('arquetipos').select('id,nombre').order('id'),
      'No se pudieron leer los arquetipos',
    ),
    select(
      supabase
        .from('calibraciones_agentes')
        .select('agente_id,tasa_calibrada')
        .eq('corrida_id', corridaId)
        .order('agente_id'),
      `No se pudieron leer las calibraciones de la corrida ${corridaId}`,
    ),
  ]);

  const archetypeById = new Map(
    archetypes.map(({ id, nombre }) => [String(id), { id: String(id), label: nombre }]),
  );
  const calibratedRateByAgentId = new Map(
    calibrations.map(({ agente_id: agentId, tasa_calibrada: rate }) => [String(agentId), Number(rate)]),
  );

  if (calibrations.length !== agents.length) {
    throw new Error(
      `La corrida ${corridaId} tiene ${calibrations.length} calibraciones para ${agents.length} agentes.`,
    );
  }

  const populationAgents = agents.map((agent) => {
    const archetype = archetypeById.get(String(agent.arquetipo_id));
    const calibratedRate = calibratedRateByAgentId.get(String(agent.id));
    if (!archetype) throw new Error(`El agente ${agent.id} no tiene un arquetipo válido.`);
    if (!Number.isFinite(calibratedRate)) {
      throw new Error(`El agente ${agent.id} no tiene una tasa calibrada válida en la corrida ${corridaId}.`);
    }

    return {
      id: String(agent.id),
      archetypeId: archetype.id,
      archetypeLabel: archetype.label,
      nivel: agent.nivel,
      tasaCalibrada: calibratedRate,
      reaccionesObservadas: agent.reacciones_observadas,
      conexionId: String(agent.conexion_id),
    };
  });

  const counts = new Map();
  for (const agent of populationAgents) {
    counts.set(agent.archetypeId, (counts.get(agent.archetypeId) ?? 0) + 1);
  }
  const distribution = archetypes
    .map(({ id, nombre }) => ({
      archetypeId: String(id),
      archetypeLabel: nombre,
      // Alias de compatibilidad consumido por `simulatePropagation().unreached`.
      label: nombre,
      count: counts.get(String(id)) ?? 0,
    }))
    .filter(({ count }) => count > 0);

  return { seed, size: populationAgents.length, agents: populationAgents, distribution };
}

module.exports = {
  loadRealPopulation,
  createCalibratedShareProbability,
  DEFAULT_SHARE_FACTOR,
};
