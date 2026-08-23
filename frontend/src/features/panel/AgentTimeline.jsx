import { initialsOf } from '../../shared/profile';
import { actionMeta } from './panel.model';

function AgentTimeline({ agent, systemPrompt }) {
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
      {/* Su historia real con vos, en números. Es lo que el agente leyó antes de
          decidir, y lo que hace que su respuesta se pueda contrastar: alguien
          que reaccionó a 2 de 14 no debería estar dando like a todo. */}
      {agent.comportamiento?.oportunidades ? (
        <p className="agent-inspector__behaviour">
          Reaccionó a <strong>{agent.comportamiento.postsConReaccion}</strong> de tus{" "}
          <strong>{agent.comportamiento.oportunidades}</strong> publicaciones que tuvo enfrente
          {agent.comportamiento.brechaPosts > 0
            ? `, y hace ${agent.comportamiento.brechaPosts} que no reacciona a nada`
            : ""}
          . Cuando lo hace: {agent.comportamiento.mezcla.like} like, {agent.comportamiento.mezcla.comentar}{" "}
          comentario, {agent.comportamiento.mezcla.compartir} compartido.
          {agent.grado === 2 ? " Es de segundo grado: solo ve tus posts si alguien los comparte." : ""}
        </p>
      ) : null}
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
      {/* La ficha es lo único que distingue a este agente de los otros once: el
          system prompt es común a todos. Se muestra tal cual se le mandó al
          modelo, sin resumir, porque el punto es poder auditarlo. */}
      {agent.ficha ? (
        <details className="agent-briefing">
          <summary>Con qué identidad se cargó a {agent.nombre}</summary>
          <pre>{agent.ficha}</pre>
          {systemPrompt ? (
            <>
              <p className="agent-briefing__note">
                Además recibe estas instrucciones, iguales para todo el panel:
              </p>
              <pre>{systemPrompt}</pre>
            </>
          ) : null}
        </details>
      ) : null}
    </div>
  );
}

export default AgentTimeline;
