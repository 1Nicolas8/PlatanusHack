const { computeWarmth } = require('../warmth/warmth.service');
const { loadAudienceData } = require('./audiencia.repository');

/**
 * De todas las reacciones con comentario de un contacto, la del post más
 * reciente es la que mejor representa cómo suena hoy — no la primera que
 * dejó ni un promedio inventado.
 */
function latestComment(connectionId, reactions, postOrderById) {
  const withText = reactions.filter((r) => r.conexionId === connectionId && r.textoComentario);
  if (withText.length === 0) return null;

  return withText.reduce((latest, current) => {
    const currentOrder = postOrderById.get(current.postId) ?? 0;
    const latestOrder = postOrderById.get(latest.postId) ?? 0;
    return currentOrder > latestOrder ? current : latest;
  }).textoComentario;
}

/**
 * Arma el resumen que consume el frontend: en vez de la copia quemada del
 * onboarding ("40 agentes", citas inventadas), esto lee la red real —
 * temperatura por contacto (warmth.service) más una cita real cuando existe.
 */
async function getResumen({ limit = 6, supabase } = {}) {
  const { connections, archetypes, posts, reactions } = await loadAudienceData({ supabase });

  const archetypeNameById = new Map(archetypes.map((a) => [a.id, a.nombre]));
  const postOrderById = new Map(posts.map((p) => [p.id, p.ordenCronologico ?? 0]));

  const warmth = computeWarmth({ connections, reactions, posts });

  const representedArchetypes = new Set(
    connections.map((c) => c.arquetipoId).filter((id) => id !== null),
  );

  const topContacts = warmth.contacts.slice(0, limit).map((contact) => ({
    connectionId: contact.connectionId,
    nombre: contact.nombre,
    headline: contact.headline,
    arquetipo: archetypeNameById.get(contact.arquetipoId) ?? null,
    ring: contact.ring,
    label: contact.label,
    score: contact.score,
    interactions: contact.interactions,
    sampleComment: latestComment(contact.connectionId, reactions, postOrderById),
  }));

  return {
    totalContacts: warmth.summary.totalContacts,
    everInteracted: warmth.summary.everInteracted,
    neverInteracted: warmth.summary.neverInteracted,
    totalArchetypes: representedArchetypes.size,
    reactionsFromOutsideNetwork: warmth.summary.reactionsFromOutsideNetwork,
    opportunityNormalized: warmth.summary.opportunityNormalized,
    note: warmth.summary.note,
    topContacts,
  };
}

module.exports = { getResumen };
