import { useState } from 'react';
import { Repeat2 } from 'lucide-react';
import AgentTimeline from './AgentTimeline';
import { initialsOf } from '../../shared/profile';
import { actionMeta, cleanPanelText, cleanSuggestedCopy, pickSuggestedCopy } from './panel.model';

function PanelResult({ result, onUseAsVariant }) {
  const [selectedAgentId, setSelectedAgentId] = useState(null);
  const selectedAgent = result.panel?.find((agent) => agent.id === selectedAgentId) ?? null;
  const hasSide = Boolean(result.objeciones?.length || result.comentarios?.length || result.comoLeerlo);
  const suggestedCopy = pickSuggestedCopy(result.mejoras);
  // Cuando el panel es más chico que la gente que vería el post, los números
  // que valen son los escalados a esa gente; cuando los cubre a todos, no hay
  // nada que escalar y el conteo crudo ES el resultado.
  const alcance = result.embudo
    ? result.embudo.proyectado ?? {
        vieron: result.embudo.vieron.cantidad,
        reaccionaron: result.embudo.reaccionaron.cantidad,
        like: result.embudo.reaccionaron.like,
        comentar: result.embudo.reaccionaron.comentar,
        compartir: result.embudo.reaccionaron.compartir,
      }
    : null;

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

      {/* Pegar un post propio para ver qué dice el panel es lo primero que hace
          cualquiera. El motor lo detecta y le borra a los agentes ese post y
          todo lo posterior, porque si no cada uno leería que ya le dio like a
          este mismo texto y devolvería la reacción real en vez de simular. Se
          avisa acá porque cambia cómo se lee el número: esto se puede contrastar
          contra lo que pasó de verdad. */}
      {result.historia?.recortada ? (
        <div className="panel-rewound">
          <strong>Este copy ya está publicado{result.historia.postOrden ? ` (publicación ${result.historia.postOrden})` : ""}.</strong>{" "}
          Los agentes se armaron con la historia previa a ese post: ninguno sabe que existió, así que
          el resultado es una simulación y no un recuerdo.
          {result.historia.reaccionesReales !== null && result.historia.reaccionesReales !== undefined ? (
            <> En la vida real juntó <strong>{result.historia.reaccionesReales}</strong> reacciones
            {result.historia.comentariosReales ? ` y ${result.historia.comentariosReales} comentarios` : ""}
            : compará contra eso.</>
          ) : null}
        </div>
      ) : null}

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
          {result.mejorasError && !result.mejoras ? (
            <div className="panel-improvements">
              <h2>Copy sugerido</h2>
              <p className="panel-improvements__empty">{result.mejorasError}</p>
            </div>
          ) : null}

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
              {suggestedCopy ? (
                <blockquote>{suggestedCopy}</blockquote>
              ) : (
                <p className="panel-improvements__empty">
                  El panel no dejó una reescritura usable. El veredicto de arriba sigue valiendo; volvé a simular para pedir otra.
                </p>
              )}
              <p>{cleanPanelText(result.mejoras.diagnostico)}</p>
              <ul>
                {(result.mejoras.mejoras ?? []).map((item) => (
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
                        <blockquote>{cleanSuggestedCopy(variante.copy)}</blockquote>
                      </article>
                    ))}
                </details>
              ) : null}
            </div>
          ) : null}

          {result.embudo ? (
            <section className="panel-projection">
              <h2>Quién ve esto y quién reacciona</h2>
              {/* El embudo, escalón por escalón. Antes acá había un número sobre
                  "tus N conexiones", que suponía sin decirlo que todos ven todo:
                  por eso proyectaba decenas de likes sobre posts que juntan
                  nueve. La mayor parte de la red se pierde en el primer paso. */}
              <ol className="panel-funnel">
                <li>
                  <strong>{result.embudo.red.primerGrado}</strong>
                  <small>contactos de primer grado</small>
                </li>
                <li>
                  <strong>{alcance.vieron}</strong>
                  <small>verían el post en su feed</small>
                </li>
                <li className="panel-funnel__end">
                  <strong>{alcance.reaccionaron}</strong>
                  <small>reaccionarían</small>
                </li>
              </ol>

              <div className="panel-projection__grid">
                <div>
                  <strong>{alcance.like}</strong>
                  <small>darían like</small>
                </div>
                <div>
                  <strong>{alcance.comentar}</strong>
                  <small>comentarían</small>
                </div>
                <div>
                  <strong>{alcance.compartir}</strong>
                  <small>compartirían</small>
                </div>
                <div>
                  <strong>{alcance.vieron - alcance.reaccionaron}</strong>
                  <small>lo verían y seguirían de largo</small>
                </div>
              </div>
              <p className="panel-projection__source">
                Los niveles son acumulativos: quien comenta también cuenta como like; quien comparte
                también cuenta como comentario y like.
              </p>

              {/* El número al lado de la realidad. Es lo único que deja ver de un
                  vistazo si la simulación se fue de mambo. */}
              {result.embudo.anclaObservada?.veredicto ? (
                <p className="panel-projection__anchor">
                  {cleanPanelText(result.embudo.anclaObservada.veredicto)}
                </p>
              ) : null}

              {/* El segundo grado no puede aparecer dando like: solo llega si
                  alguien de tu red comparte. Va en su propia fila, con esa
                  condición escrita, en vez de sumado al total. */}
              <p className="panel-projection__source">
                <strong>Segundo grado:</strong>{" "}
                {result.embudo.segundoGrado.juzgados > 0
                  ? `${result.embudo.segundoGrado.reaccionaron} de ${result.embudo.segundoGrado.juzgados} personas fuera de tu red reaccionarían, y solo porque ${result.embudo.segundoGrado.porCompartidor.length} contacto(s) tuyo(s) compartirían el post.`
                  : cleanPanelText(result.embudo.segundoGrado.comoLeerlo)}
              </p>

              {/* Los nombres son los del panel y solo los del panel: al resto de
                  la red nadie le preguntó, y listarlos sería inventarlos. */}
              <p className="panel-projection__names">
                De los {result.embudo.vieron.cantidad} que juzgamos uno por uno:{" "}
                {["like", "comentar", "compartir"]
                  .filter((accion) => result.embudo.delPanel[accion]?.length)
                  .map((accion) => (
                    <span key={accion}>
                      <strong>{accion === "like" ? "like" : accion === "comentar" ? "comentan" : "comparten"}</strong>{" "}
                      {result.embudo.delPanel[accion].map((persona) => persona.nombre).join(", ")}.{" "}
                    </span>
                  ))}
                {result.embudo.delPanel.ignorar?.length
                  ? `Sin reacción: ${result.embudo.delPanel.ignorar.map((persona) => persona.nombre).join(", ")}.`
                  : null}
              </p>

              <p className="panel-projection__source">
                <strong>Cuántos ven el post:</strong> {cleanPanelText(result.embudo.vieron.fuente)}.
                {result.embudo.contraste?.mezclaObservada ? (
                  <>
                    <br />
                    <strong>Contra lo observado:</strong> {cleanPanelText(result.embudo.contraste.nota)}
                  </>
                ) : null}
              </p>
              <p className="panel-reading-note">{cleanPanelText(result.embudo.comoLeerlo)}</p>
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
              {selectedAgent ? (
                <AgentTimeline
                  agent={selectedAgent}
                  systemPrompt={result.configuracion?.systemPrompt}
                  instrucciones={result.configuracion?.instrucciones}
                  copy={result.copy}
                />
              ) : null}
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
