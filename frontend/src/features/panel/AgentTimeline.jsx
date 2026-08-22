import { initialsOf } from '../../shared/profile';
import { actionMeta } from './panel.model';

function AgentTimeline({ agent }) {
  return (
    <div className="agent-inspector">
      <div className="agent-inspector__identity">
        {agent.fotoUrl ? <img src={agent.fotoUrl} alt="" /> : <span>{initialsOf(agent.nombre)}</span>}
        <div>
          <strong>{agent.nombre}</strong>
          <small>{agent.headline || "Sin headline"}</small>
        </div>
        <span className={`consistency-stamp ${agent.consistente ? "is-steady" : ""}`}>
          {agent.consistente ? "señal consistente" : "respuesta variable"}
        </span>
      </div>
      <div className="agent-timeline">
        {(agent.historial ?? []).map((turn, index) => {
          const { Icon, label } = actionMeta(turn.accion);
          return (
            <article key={`${turn.iteracion}-${turn.ronda}-${index}`}>
              <div className="agent-timeline__rail"><span>{turn.iteracion}.{turn.ronda}</span></div>
              <div className="agent-timeline__body">
                <div className="agent-timeline__top">
                  <b>Corrida {turn.iteracion} · ronda {turn.ronda}</b>
                  <span className={`action-chip action-chip--${turn.accion}`}><Icon size={12} /> {label}</span>
                </div>
                <p>{turn.razon || "Sin explicación registrada."}</p>
                {turn.comentario ? <blockquote>“{turn.comentario}”</blockquote> : null}
                {turn.objecion ? <small>Objeción: {turn.objecion}</small> : null}
                <small>
                  {turn.vioElCopy ? "Vio el copy completo" : "Lectura inconclusa"}
                  {turn.vioComentarios?.length
                    ? ` · antes leyó a ${turn.vioComentarios.join(", ")}`
                    : " · opinó sin comentarios previos"}
                </small>
              </div>
            </article>
          );
        })}
      </div>
      {!agent.historial?.length ? <p className="agent-inspector__empty">Esta corrida antigua no tiene turnos legibles.</p> : null}
    </div>
  );
}

export default AgentTimeline;
