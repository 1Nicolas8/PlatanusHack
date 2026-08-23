import { initialsOf } from '../../shared/profile';
import { actionMeta } from './panel.model';

function AgentTimeline({ agent, systemPrompt, instrucciones, copy }) {
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
      {/* El prompt entero, en las tres piezas con las que se arma y en el mismo
          orden en que le llegan al modelo. Se muestra tal cual se mandó: la
          única forma de discutir un score bajo es poder leer qué se preguntó.
          Lo que cambia de un agente a otro es la ficha del medio; el system y
          las instrucciones son iguales para los doce, y verlos al lado es lo
          que deja ver cuánto de la respuesta es la persona y cuánto el molde. */}
      {agent.ficha ? (
        <details className="agent-briefing">
          <summary>Ver el prompt completo con el que se corrió a {agent.nombre}</summary>

          {systemPrompt ? (
            <>
              <p className="agent-briefing__note">
                <b>1 · System prompt</b> — igual para todo el panel.
              </p>
              <pre>{systemPrompt}</pre>
            </>
          ) : null}

          <p className="agent-briefing__note">
            <b>{systemPrompt ? "2" : "1"} · Su identidad</b> — lo único que lo distingue de los
            otros agentes. Nada acá está inventado: sale de su perfil y de sus reacciones observadas.
          </p>
          <pre>{agent.ficha}</pre>

          {copy ? (
            <>
              <p className="agent-briefing__note">
                <b>{systemPrompt ? "3" : "2"} · El copy que se le mostró.</b>
              </p>
              <pre>{copy}</pre>
            </>
          ) : null}

          {instrucciones ? (
            <>
              <p className="agent-briefing__note">
                <b>{[systemPrompt, copy].filter(Boolean).length + 2} · Qué se le pidió</b> — la
                escala del score y la coherencia con su propia frecuencia. También común al panel.
                En las rondas 2 en adelante, antes de esto ve los comentarios que ya escribieron
                los otros (arriba, en cada turno, figura a quiénes leyó).
              </p>
              <pre>{instrucciones}</pre>
            </>
          ) : null}
        </details>
      ) : null}
    </div>
  );
}

export default AgentTimeline;
