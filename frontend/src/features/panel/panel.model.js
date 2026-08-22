/** Forma de los datos del panel: acciones, hidratacion y limpieza de texto. */

import { Eye, Heart, MessageCircle, Share2 } from 'lucide-react';

const ACTIONS = {
  like: { label: "Dio like", short: "Like", Icon: Heart },
  comentar: { label: "Comentó", short: "Comentario", Icon: MessageCircle },
  compartir: { label: "Compartió", short: "Compartir", Icon: Share2 },
  ignorar: { label: "Lo vio · no reaccionó", short: "Sin reacción", Icon: Eye },
  error: { label: "No completó la lectura", short: "Error", Icon: Eye },
};

function actionMeta(action) {
  return ACTIONS[action] ?? { label: action || "Sin respuesta", short: action || "—", Icon: Eye };
}

function hydratePanelRun(run) {
  const turnsByAgent = new Map();
  for (const turn of run.turnos ?? []) {
    const keys = [turn.conexionId ? String(turn.conexionId) : null, turn.nombre].filter(Boolean);
    for (const key of keys) {
      const list = turnsByAgent.get(key) ?? [];
      if (!list.some((item) => item === turn)) list.push(turn);
      turnsByAgent.set(key, list);
    }
  }

  return {
    ...run,
    panel: (run.panel ?? []).map((agent) => ({
      ...agent,
      historial: agent.historial?.length
        ? agent.historial
        : (turnsByAgent.get(String(agent.id)) ?? turnsByAgent.get(agent.nombre) ?? []).map((turn) => ({
            iteracion: turn.iteracion,
            ronda: turn.ronda,
            vioElCopy: turn.accion !== "error",
            accion: turn.accion,
            score: turn.score,
            razon: turn.razon,
            objecion: turn.objecion,
            comentario: turn.comentario,
            vioComentarios: turn.vio ?? [],
          })),
    })),
  };
}

function reactionsIndex(panel) {
  const index = {}
  for (const agent of panel ?? []) {
    if (!agent.accionDominante) continue
    if (agent.id != null) index[String(agent.id)] = agent.accionDominante
    if (agent.nombre) index[agent.nombre] = agent.accionDominante
    if (agent.fotoUrl) index[agent.fotoUrl] = agent.accionDominante
  }
  return Object.keys(index).length ? index : null
}

function cleanPanelText(text) {
  return String(text ?? "")
    .replace(/<\/?[a-zA-Z][^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export { ACTIONS, actionMeta, hydratePanelRun, reactionsIndex, cleanPanelText };
