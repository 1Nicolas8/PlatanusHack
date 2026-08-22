const AppError = require('../../shared/errors/AppError');
const { createRng } = require('../../shared/utils/rng');
const { loadRealPopulation } = require('../audience/audience.real-population');
const {
  findLatestCalibrationRun, listArchetypes, listConnections, loadReactionHistory,
} = require('./reaccion.repository');
const { evaluateArchetypeReaction, generateIndividualComment } = require('./reaccion.llm-client');

function normalizeProbabilities(verdict) {
  const total = verdict.probLike + verdict.probComentario + verdict.probIgnorar;
  if (total <= 0) throw AppError.badRequest('El LLM devolvió probabilidades de reacción inválidas.');

  return {
    probLike: verdict.probLike / total,
    probComentario: verdict.probComentario / total,
    probIgnorar: verdict.probIgnorar / total,
    comentarioEjemplo: verdict.comentarioEjemplo,
  };
}

function sampleAction({ probabilities, tasaCalibrada, rng }) {
  const probLike = probabilities.probLike * tasaCalibrada;
  const probComentario = probabilities.probComentario * tasaCalibrada;
  const sample = rng.next();

  if (sample < probLike) return 'like';
  if (sample < probLike + probComentario) return 'comentario';
  return 'ignorar';
}

async function simulateReaction({ copy, corridaId, supabase } = {}) {
  const calibrationRun = corridaId
    ? { id: corridaId }
    : await findLatestCalibrationRun({ supabase });
  if (!calibrationRun) {
    throw AppError.conflict('No hay una corrida de calibración disponible para simular reacciones.');
  }

  const [population, archetypes, connections] = await Promise.all([
    loadRealPopulation({ corridaId: calibrationRun.id, supabase }),
    listArchetypes({ supabase }),
    listConnections({ supabase }),
  ]);
  const connectionById = new Map(connections.map((connection) => [connection.id, connection]));
  const archetypeById = new Map(archetypes.map((archetype) => [archetype.id, archetype]));
  const presentArchetypes = population.distribution.map((distribution) => {
    const archetype = archetypeById.get(distribution.archetypeId);
    if (!archetype) {
      throw AppError.badRequest(`No existe contexto para el arquetipo ${distribution.archetypeLabel}.`);
    }
    return archetype;
  });
  const verdicts = await Promise.all(presentArchetypes.map(async (archetype) => {
    const llmVerdict = await evaluateArchetypeReaction({ copy, archetype });
    return { archetype, llmVerdict, probabilities: normalizeProbabilities(llmVerdict) };
  }));
  const probabilitiesByArchetypeId = new Map(
    verdicts.map(({ archetype, probabilities }) => [archetype.id, probabilities]),
  );
  const verdictByArchetypeId = new Map(
    verdicts.map(({ archetype, llmVerdict }) => [archetype.id, llmVerdict]),
  );
  const rng = createRng(`reaccion:${copy}:${calibrationRun.id}`);
  const summary = { totalAgentesSimulados: population.size, likes: 0, comentarios: 0, ignorados: 0 };
  const reactions = { likes: [], comentarios: [] };

  for (const agent of population.agents) {
    const action = sampleAction({
      probabilities: probabilitiesByArchetypeId.get(agent.archetypeId),
      tasaCalibrada: agent.tasaCalibrada,
      rng,
    });
    if (action === 'ignorar') {
      summary.ignorados += 1;
      continue;
    }

    const connection = connectionById.get(agent.conexionId);
    if (!connection) {
      throw AppError.badRequest(`No existe la conexión asociada al agente ${agent.id}.`);
    }
    const identity = {
      connectionId: connection.id,
      nombre: connection.nombre,
      headline: connection.headline,
      arquetipo: agent.archetypeLabel,
    };
    if (action === 'like') {
      summary.likes += 1;
      reactions.likes.push({ ...identity, agent });
    } else {
      summary.comentarios += 1;
      reactions.comentarios.push({ ...identity, agent });
    }
  }
  const reactionHistoryByConnectionId = await loadReactionHistory({
    connectionIds: [...reactions.likes, ...reactions.comentarios].map(({ connectionId }) => connectionId),
    supabase,
  });
  const buildProfile = ({ agent, connectionId, prompt, respuestaLLM }) => ({
    arquetipo: archetypeById.get(agent.archetypeId),
    calibracion: {
      tasaCalibrada: agent.tasaCalibrada,
      nivel: agent.nivel,
      reaccionesObservadas: agent.reaccionesObservadas,
    },
    historialReacciones: reactionHistoryByConnectionId.get(connectionId) ?? [],
    prompt,
    respuestaLLM,
  });
  reactions.likes = reactions.likes.map(({ agent, ...identity }) => {
    const verdict = verdictByArchetypeId.get(agent.archetypeId);
    return {
      ...identity,
      perfil: buildProfile({
        agent,
        connectionId: identity.connectionId,
        prompt: verdict.prompt,
        respuestaLLM: {
          probLike: verdict.probLike,
          probComentario: verdict.probComentario,
          probIgnorar: verdict.probIgnorar,
          comentarioEjemplo: verdict.comentarioEjemplo,
        },
      }),
    };
  });
  reactions.comentarios = await Promise.all(reactions.comentarios.map(async ({ agent, ...identity }) => {
    const llmComment = await generateIndividualComment({
      copy,
      archetype: archetypeById.get(agent.archetypeId),
      nombre: identity.nombre,
      headline: identity.headline,
    });
    return {
      ...identity,
      comentario: llmComment.comentario,
      perfil: buildProfile({
        agent,
        connectionId: identity.connectionId,
        prompt: llmComment.prompt,
        respuestaLLM: llmComment.comentario,
      }),
    };
  }));

  return {
    porArquetipo: verdicts.map(({ archetype, probabilities }) => ({
      arquetipo: archetype.nombre,
      ...probabilities,
    })),
    resumen: summary,
    reacciones: reactions,
  };
}

module.exports = { simulateReaction, normalizeProbabilities, sampleAction };
