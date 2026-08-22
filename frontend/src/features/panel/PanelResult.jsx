import { useState } from 'react';
import { Repeat2 } from 'lucide-react';
import AgentTimeline from './AgentTimeline';
import { initialsOf } from '../../shared/profile';
import { actionMeta, cleanPanelText } from './panel.model';

function PanelResult({ result, onUseAsVariant }) {
  const [selectedAgentId, setSelectedAgentId] = useState(null);
  const selectedAgent = result.panel?.find((agent) => agent.id === selectedAgentId) ?? null;
  const hasSide = Boolean(result.objeciones?.length || result.comentarios?.length || result.comoLeerlo);

  return (
    <section className="panel-result" aria-live="polite">
      <div className="panel-result__headline">
        <span className={`panel-score panel-score--${result.banda.replace(/\s+/g, "-")}`}>{result.score}</span>
        <div>
          <strong>{result.veredicto}</strong>
          <p>
            {result.configuracion.panel} agentes · dispersión {result.dispersion} ·{" "}
            {result.convergio ? "resultado estable" : "caso borde"}
          </p>
        </div>
        <button className="variant-button" type="button" onClick={onUseAsVariant}>
          <Repeat2 size={14} /> Crear variante
        </button>
      </div>

      {result.porIteracion?.length ? (
        <div className="run-strip" aria-label="Resultados por corrida">
          {result.porIteracion.map((run) => (
            <div key={run.iteracion}>
              <span>Corrida {run.iteracion}</span>
              <strong>{run.score}</strong>
              <small>{run.likes} likes · {run.comentarios} comentarios · {run.ignorados} sin reacción</small>
            </div>
          ))}
        </div>
      ) : null}

      <div className="panel-result__body">
        <div className="panel-result__primary">
          {result.mejorasError ? <p className="panel-reading-note">{result.mejorasError}</p> : null}

          {result.mejoras ? (
            <div className="panel-improvements">
              <h2>Copy sugerido</h2>
              {/* El score medido va pegado al texto: copiarlo sin saber si el
                  panel lo votó mejor que el original es exactamente lo que
                  hacía que la sugerencia decepcionara. */}
              {result.mejoras.prueba ? (
                <p className={result.mejoras.prueba.gano ? "panel-proof panel-proof--won" : "panel-proof"}>
                  <strong>
                    {result.mejoras.prueba.score}/100 medido{" "}
                    {result.mejoras.prueba.delta >= 0 ? `(+${result.mejoras.prueba.delta})` : `(${result.mejoras.prueba.delta})`}
                  </strong>{" "}
                  contra los {result.mejoras.prueba.baseline}/100 del original.{" "}
                  {cleanPanelText(result.mejoras.prueba.veredicto)}
                </p>
              ) : null}
              <blockquote>{cleanPanelText(result.mejoras.copySugerido)}</blockquote>
              <p>{cleanPanelText(result.mejoras.diagnostico)}</p>
              <ul>
                {result.mejoras.mejoras.map((item) => (
                  <li key={item.cambio}>
                    <strong>{cleanPanelText(item.cambio)}</strong> — {cleanPanelText(item.porQue)}
                  </li>
                ))}
              </ul>
              {result.mejoras.variantes?.length > 1 ? (
                <details className="panel-variants">
                  <summary>Las otras variantes que votó el panel</summary>
                  {result.mejoras.variantes
                    .filter((variante) => !variante.recomendada)
                    .map((variante) => (
                      <article key={variante.enfoque}>
                        <strong>
                          {variante.score}/100 — {cleanPanelText(variante.enfoque)}
                        </strong>
                        <blockquote>{cleanPanelText(variante.copy)}</blockquote>
                      </article>
                    ))}
                </details>
              ) : null}
            </div>
          ) : null}

          {result.proyeccion ? (
            <section className="panel-projection">
              <h2>Sobre tus {result.proyeccion.totalRed} conexiones</h2>
              <div className="panel-projection__grid">
                <div>
                  <strong>{result.proyeccion.estimado.like}</strong>
                  <small>darían like</small>
                </div>
                <div>
                  <strong>{result.proyeccion.estimado.comentar}</strong>
                  <small>comentarían</small>
                </div>
                <div>
                  <strong>{result.proyeccion.estimado.compartir}</strong>
                  <small>compartirían</small>
                </div>
                <div>
                  <strong>{result.proyeccion.totalRed - result.proyeccion.estimado.reaccionanEnTotal}</strong>
                  <small>seguirían de largo</small>
                </div>
              </div>
              {/* Los nombres son los del panel y solo los del panel: al resto de
                  la red nadie le preguntó, y listarlos sería inventarlos. */}
              <p className="panel-projection__names">
                De los {result.proyeccion.juzgados} que juzgamos uno por uno:{" "}
                {["like", "comentar", "compartir"]
                  .filter((accion) => result.proyeccion.delPanel[accion]?.length)
                  .map((accion) => (
                    <span key={accion}>
                      <strong>{accion === "like" ? "like" : accion === "comentar" ? "comentan" : "comparten"}</strong>{" "}
                      {result.proyeccion.delPanel[accion].map((persona) => persona.nombre).join(", ")}.{" "}
                    </span>
                  ))}
                {result.proyeccion.delPanel.ignorar?.length
                  ? `Sin reacción: ${result.proyeccion.delPanel.ignorar.map((persona) => persona.nombre).join(", ")}.`
                  : null}
              </p>
              <p className="panel-reading-note">{cleanPanelText(result.proyeccion.comoLeerlo)}</p>
            </section>
          ) : null}

          {result.panel?.length ? (
            <section className="panel-members">
              <div className="panel-members__heading">
                <div>
                  <h2>Qué hizo cada persona</h2>
                  <p>Abre un agente para ver cada like, comentario o lectura sin reacción.</p>
                </div>
                <span>{result.panel.length} agentes</span>
              </div>
              <div className="panel-members__grid">
                {result.panel.map((agent) => (
                  <button
                    className={selectedAgentId === agent.id ? "is-selected" : ""}
                    type="button"
                    key={agent.id}
                    onClick={() => setSelectedAgentId(selectedAgentId === agent.id ? null : agent.id)}
                    aria-expanded={selectedAgentId === agent.id}
                    aria-label={`Ver actividad de ${agent.nombre}`}
                  >
                    {agent.fotoUrl ? <img src={agent.fotoUrl} alt="" referrerPolicy="no-referrer" /> : <span>{initialsOf(agent.nombre)}</span>}
                    <div>
                      <strong>{agent.nombre}</strong>
                      <small>{agent.headline || "Sin headline"}</small>
                      <p>{actionMeta(agent.accionDominante).short} · score {agent.scoreMedio ?? "—"}</p>
                    </div>
                  </button>
                ))}
              </div>
              {selectedAgent ? <AgentTimeline agent={selectedAgent} /> : null}
            </section>
          ) : null}
        </div>

        {hasSide ? (
          <aside className="panel-result__side">
            {result.objeciones?.length ? (
              <div className="panel-side-block">
                <h2>Qué los frena</h2>
                <ul className="panel-objections">
                  {result.objeciones.slice(0, 6).map((item) => (
                    <li key={item.texto}>
                      <strong>{item.veces}×</strong> {cleanPanelText(item.texto)} <small>— {item.de}</small>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {result.comentarios?.length ? (
              <div className="panel-side-block">
                <h2>Lo que diría tu red</h2>
                {result.comentarios.slice(0, 6).map((item, index) => (
                  <article key={`${item.nombre}-${item.iteracion}-${index}`}>
                    <strong>{item.nombre}</strong>
                    <small>{item.headline}</small>
                    <p>“{cleanPanelText(item.comentario)}”</p>
                  </article>
                ))}
              </div>
            ) : null}

            {result.comoLeerlo ? <p className="panel-reading-note">{cleanPanelText(result.comoLeerlo)}</p> : null}
          </aside>
        ) : null}
      </div>
    </section>
  );
}

export default PanelResult;
