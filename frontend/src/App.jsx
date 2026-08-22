import NeuralNet from './NeuralNet'
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Eye,
  Heart,
  History,
  LoaderCircle,
  LockKeyhole,
  MessageCircle,
  Network,
  Repeat2,
  Send,
  Share2,
  Sparkles,
  Users,
} from "lucide-react";
import {
  evaluatePanel,
  fetchPanelRun,
  fetchPanelRuns,
  fetchProfileCoverage,
  fetchResumenAudiencia,
  startNetworkRun,
  waitForNetworkRun,
} from "./api";

function profileHandle(perfil) {
  return perfil?.match(/linkedin\.com\/in\/([^/?]+)/i)?.[1] ?? "tu perfil";
}

function Brand() {
  return (
    <a className="brand" href="#top" aria-label="Hippocamp, inicio">
      <span className="brand-mark" aria-hidden="true">
        H
      </span>
      <span>hippocamp</span>
    </a>
  );
}

function Header({ compact = false, onReset, perfil }) {
  return (
    <header className={`site-header ${compact ? "site-header--compact" : ""}`}>
      <Brand />
      {compact ? (
        <button className="profile-pill" type="button" onClick={onReset}>
          <span className="mini-avatar">IN</span>
          <span>@{profileHandle(perfil)}</span>
          <ChevronDown size={15} strokeWidth={1.8} />
        </button>
      ) : (
        <div className="header-note">
          <span className="status-dot" /> simulación privada
        </div>
      )}
    </header>
  );
}

function PortraitStack() {
  const people = [
    ["MC", "portrait portrait--one"],
    ["JF", "portrait portrait--two"],
    ["AR", "portrait portrait--three"],
    ["+37", "portrait portrait--count"],
  ];

  return (
    <div className="portrait-row" aria-label="Ejemplo de audiencia sintética">
      <div className="portrait-stack">
        {people.map(([initials, className]) => (
          <span className={className} key={initials}>
            {initials}
          </span>
        ))}
      </div>
      <p>
        <strong>Personas, no promedios.</strong>
        <br />
        Cada reacción conserva una historia.
      </p>
    </div>
  );
}

function Onboarding({ onSubmit, busy, remoteError }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const submit = (event) => {
    event.preventDefault();
    const candidate = url.trim();
    if (
      !/^https?:\/\/(www\.)?linkedin\.com\/in\/[\w%_-]+\/?(?:\?.*)?$/i.test(
        candidate,
      )
    ) {
      setError(
        "Pega una URL de perfil de LinkedIn válida, por ejemplo linkedin.com/in/tu-nombre.",
      );
      return;
    }
    setError("");
    onSubmit({ profileUrl: candidate });
  };

  return (
    <main className="onboarding" id="top">
      <Header />
      <section className="hero">
        <div className="eyebrow reveal reveal--one">
          <span>01</span> construyamos tu audiencia
        </div>
        <h1 className="reveal reveal--two">
          Antes de probar tu mensaje,
          <br />
          <em>déjanos conocerte.</em>
        </h1>
        <p className="hero-copy reveal reveal--three">
          Tu red ya sabe qué te funciona. Leemos las señales de tu perfil para
          crear una audiencia sintética tan particular como la real.
        </p>

        <form
          className="linkedin-form reveal reveal--four"
          onSubmit={submit}
          noValidate
        >
          <label htmlFor="linkedin-url">Tu perfil de LinkedIn</label>
          <div className={`input-shell ${error ? "input-shell--error" : ""}`}>
            <span className="linkedin-glyph" aria-hidden="true">
              in
            </span>
            <input
              id="linkedin-url"
              type="url"
              value={url}
              onChange={(event) => {
                setUrl(event.target.value);
                setError("");
              }}
              placeholder="linkedin.com/in/tu-nombre"
              autoComplete="url"
              aria-describedby={error ? "url-error" : "privacy-note"}
              aria-invalid={Boolean(error)}
              disabled={busy}
            />
            <button type="submit" aria-label="Analizar perfil">
              <ArrowRight size={20} />
            </button>
          </div>
          {error || remoteError ? (
            <p className="form-error" id="url-error">
              {error || remoteError}
            </p>
          ) : null}
          <div className="form-foot" id="privacy-note">
            <span>
              <LockKeyhole size={13} /> Solo usamos información pública
            </span>
          </div>
        </form>

        <PortraitStack />
      </section>
      <div className="orbit orbit--one" aria-hidden="true" />
      <div className="orbit orbit--two" aria-hidden="true" />
      <footer className="onboarding-footer">
        <span>HECHO PARA ENCONTRAR LA VERDAD ANTES DE PUBLICAR</span>
        <i />
      </footer>
    </main>
  );
}

const LOAD_STEPS = [
  ["Leyendo tu trayectoria", "Roles, industrias y temas que te importan"],
  ["Mapeando tu red", "Conexiones, comunidades y cercanía"],
  [
    "Entendiendo las señales",
    "Reacciones, comentarios y patrones de contenido",
  ],
  ["Preparando tus agentes", "Voces plausibles, contexto y criterio propio"],
];

/**
 * Las caras que van llegando mientras el scraper trabaja.
 *
 * El backend emite personas de a lotes de 5 en cuanto las reconoce, asi que la
 * espera muestra gente real en vez de una barra girando. El contador dice
 * "reconocidas" y no un total: mientras corre no se sabe cuantas hay.
 */
function CarasReconocidas({ personas }) {
  if (!personas.length) return null;

  return (
    <div className="reconocidas" aria-live="polite">
      <p>
        <strong>{personas.length}</strong> personas de tu red reconocidas
      </p>
      <div className="reconocidas-grid">
        {personas.map((p) => (
          <span className="reconocida" key={p.url || p.nombre} title={`${p.nombre} — ${p.headline || ""}`}>
            {p.photoUrl ? (
              <img src={p.photoUrl} alt="" loading="lazy" />
            ) : (
              // Sin foto igual entra: el nodo existe aunque no tenga cara.
              <i>{String(p.nombre || "?").slice(0, 1)}</i>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

function LoadingProfile({ onComplete, runId, onError }) {
  const [activeStep, setActiveStep] = useState(0);
  const [personas, setPersonas] = useState([]);
  const [dueno, setDueno] = useState(null);

  // La animación avanza hasta el anteúltimo paso y espera ahí: el último lo
  // marca la corrida real, no un temporizador. Sin esto la pantalla diria
  // "listo" mientras el actor todavia esta trabajando.
  useEffect(() => {
    const interval = window.setInterval(() => {
      setActiveStep((current) => Math.min(current + 1, LOAD_STEPS.length - 2));
    }, 720);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!runId) return undefined;
    let cancelled = false;

    waitForNetworkRun(runId, {
      onProgress: (run) => {
        if (cancelled) return;
        // El dueño llega antes que la gente: sale de la primera publicacion
        // que devuelve el scraper, no de la red.
        if (run.dueno?.photoUrl) setDueno(run.dueno);
        if (!run.progreso?.length) return;
        setPersonas(run.progreso);
        // Si ya hay caras, el paso de "mapeando tu red" esta pasando de verdad:
        // se salta la animacion por temporizador y se muestra el real.
        setActiveStep((actual) => Math.max(actual, 2));
      },
    })
      .then((run) => {
        if (cancelled) return;
        if ((run.written?.profilesMatched ?? 0) < 3) {
          onError("El actor no devolvió al menos tres perfiles utilizables para formar el panel.");
          return;
        }
        setActiveStep(LOAD_STEPS.length - 1);
        window.setTimeout(() => onComplete(run), 650);
      })
      .catch((err) => {
        if (!cancelled) onError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [runId, onComplete, onError]);

  return (
    <main className="loading-page">
      <Header />
      <section className="loading-card" aria-live="polite">
        <div className="scan-portrait">
          {dueno?.photoUrl ? (
            <img src={dueno.photoUrl} alt={dueno.nombre ?? ""} />
          ) : (
            <span>IN</span>
          )}
          <i />
        </div>
        <div>
          <div className="eyebrow">
            <span>02</span> aprendiendo de ti
          </div>
          <h1>
            Estamos convirtiendo
            <br />
            tu red en una <em>audiencia.</em>
          </h1>
        </div>
        <div className="steps-list">
          {LOAD_STEPS.map(([title, detail], index) => (
            <div
              className={`load-step ${index < activeStep ? "is-done" : ""} ${index === activeStep ? "is-active" : ""}`}
              key={title}
            >
              <span className="step-icon">
                {index < activeStep ? (
                  <Check size={15} />
                ) : index === activeStep ? (
                  <LoaderCircle size={15} />
                ) : (
                  index + 1
                )}
              </span>
              <span>
                <strong>{title}</strong>
                <small>{detail}</small>
              </span>
            </div>
          ))}
        </div>
        <CarasReconocidas personas={personas} />
      </section>
    </main>
  );
}

const exampleCopy =
  "La mayoría de equipos no necesita más datos. Necesita saber cuál señal merece atención. Construimos Hippocamp para probar tu mensaje antes de publicarlo.";

function initialsOf(nombre) {
  return nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

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

function AgentPreview({ resumen, perfil }) {
  const ownerLabel = profileHandle(perfil);

  return (
    <aside className="agent-preview" aria-label="Audiencia">
      <NeuralNet
        owner={{ fotoUrl: resumen?.ownerFotoUrl, label: ownerLabel }}
        contacts={resumen?.topContacts}
      />
    </aside>
  );
}

function cleanPanelText(text) {
  return String(text ?? "")
    .replace(/<\/?[a-zA-Z][^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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
          {result.mejoras ? (
            <div className="panel-improvements">
              <h2>Copy sugerido</h2>
              <blockquote>{cleanPanelText(result.mejoras.copySugerido)}</blockquote>
              <p>{cleanPanelText(result.mejoras.diagnostico)}</p>
              <ul>
                {result.mejoras.mejoras.map((item) => (
                  <li key={item.cambio}>
                    <strong>{cleanPanelText(item.cambio)}</strong> — {cleanPanelText(item.porQue)}
                  </li>
                ))}
              </ul>
            </div>
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

function RunHistory({ runs, activeId, loadingId, onOpen }) {
  if (!runs.length) return null;
  return (
    <section className="run-history">
      <div className="run-history__heading">
        <History size={16} />
        <div><strong>Historial de corridas</strong><small>Ábrelas o úsalas como punto de partida.</small></div>
      </div>
      <div className="run-history__list">
        {runs.map((run, index) => (
          <button
            type="button"
            key={run.corridaId}
            className={activeId === run.corridaId ? "is-active" : ""}
            onClick={() => onOpen(run.corridaId)}
            disabled={loadingId === run.corridaId}
          >
            <span><b>{index === 0 ? "Última" : `#${runs.length - index}`}</b>{run.copy}</span>
            <span><strong>{run.score ?? "—"}</strong><small>{run.configuracion?.iteraciones ?? "—"} corridas</small></span>
          </button>
        ))}
      </div>
    </section>
  );
}

function Workspace({ onReset, perfil }) {
  const [copy, setCopy] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [resumen, setResumen] = useState(null);
  const [reaccion, setReaccion] = useState(null);
  const [panelSize, setPanelSize] = useState(12);
  const [rounds, setRounds] = useState(2);
  const [iterations, setIterations] = useState(3);
  const [runs, setRuns] = useState([]);
  const [loadingRunId, setLoadingRunId] = useState(null);
  const [simulationError, setSimulationError] = useState("");
  const [isSimulating, setIsSimulating] = useState(false);
  const textareaRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    fetchResumenAudiencia({ perfil, limit: 16 })
      .then((data) => {
        if (!cancelled) setResumen(data);
      })
      .catch((error) =>
        console.warn(
          "No se pudo cargar el resumen de audiencia:",
          error.message,
        ),
      );
    return () => {
      cancelled = true;
    };
  }, [perfil]);

  useEffect(() => {
    let cancelled = false;
    fetchPanelRuns({ perfil })
      .then((data) => {
        if (!cancelled) setRuns(data.corridas ?? []);
      })
      .catch((error) => console.warn("No se pudo cargar el historial del panel:", error.message));
    return () => {
      cancelled = true;
    };
  }, [perfil]);

  const changeDraft = () => {
    setSubmitted(false);
    setSimulationError("");
  };

  const runSimulation = async () => {
    if (!copy.trim()) {
      textareaRef.current?.focus();
      return;
    }
    setIsSimulating(true);
    setSimulationError("");
    try {
      const data = await evaluatePanel({
        perfil,
        copy: copy.trim(),
        panel: panelSize,
        rondas: rounds,
        iteraciones: iterations,
      });
      setReaccion(hydratePanelRun(data));
      if (data.trazada) {
        setRuns((current) => [
          {
            corridaId: data.corridaId,
            copy: copy.trim(),
            score: data.score,
            dispersion: data.dispersion,
            convergio: data.convergio,
            veredicto: data.veredicto,
            configuracion: data.configuracion,
            creadaEn: new Date().toISOString(),
          },
          ...current.filter((run) => run.corridaId !== data.corridaId),
        ].slice(0, 12));
      }
      setSubmitted(true);
    } catch {
      setSimulationError("No pudimos reunir el panel. Intenta de nuevo.");
    } finally {
      setIsSimulating(false);
    }
  };

  const openRun = async (corridaId) => {
    setLoadingRunId(corridaId);
    setSimulationError("");
    try {
      const data = hydratePanelRun(await fetchPanelRun(corridaId));
      setReaccion(data);
      setCopy(data.copy);
      setPanelSize(data.configuracion.panel);
      setRounds(data.configuracion.rondas);
      setIterations(data.configuracion.iteraciones);
      setSubmitted(true);
    } catch {
      setSimulationError("No pudimos abrir esa corrida guardada.");
    } finally {
      setLoadingRunId(null);
    }
  };

  const useAsVariant = () => {
    changeDraft();
    textareaRef.current?.focus();
    textareaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <main className={`workspace${reaccion ? " workspace--report" : ""}`}>
      <Header compact onReset={onReset} perfil={perfil} />
      <div className="workspace-shell">
        <section className="copy-studio">
          <div className="welcome-line">
            <span className="success-seal">
              <Check size={18} />
            </span>
            <span>Perfil entendido</span>
          </div>
          <h1>
            Hola, @{profileHandle(perfil)}.
            <br />
            <em>Probemos tu copy.</em>
          </h1>
          <p className="studio-intro">
            Tu audiencia ya está en la sala. Pega el mensaje que estás
            considerando publicar y escucha lo que realmente les provoca.
          </p>
        </section>

        <div className="workspace-stage">
          <div className="workspace-composer">
          <div className={`composer ${submitted ? "composer--submitted" : ""}`}>
            <div className="composer-top">
              <span className="composer-label">Tu mensaje</span>
              <div className="composer-actions">
                <label className="panel-size-control">
                  Panel
                  <input
                    type="range"
                    min="3"
                    max="40"
                    step="1"
                  value={panelSize}
                  onChange={(event) => {
                    setPanelSize(Number(event.target.value));
                    changeDraft();
                  }}
                    disabled={isSimulating}
                  />
                  <output>{panelSize}</output>
                </label>
                <label className="compact-control">
                  Rondas
                  <select
                    value={rounds}
                    onChange={(event) => { setRounds(Number(event.target.value)); changeDraft(); }}
                    disabled={isSimulating}
                  >
                    {[1, 2, 3].map((value) => <option value={value} key={value}>{value}</option>)}
                  </select>
                </label>
                <label className="compact-control">
                  Corridas
                  <select
                    value={iterations}
                    onChange={(event) => { setIterations(Number(event.target.value)); changeDraft(); }}
                    disabled={isSimulating}
                  >
                    {[1, 2, 3, 4, 5].map((value) => <option value={value} key={value}>{value}</option>)}
                  </select>
                </label>
                <button type="button" onClick={() => { setCopy(exampleCopy); changeDraft(); }}>
                  <Sparkles size={14} /> Usar ejemplo
                </button>
              </div>
            </div>
            <textarea
              ref={textareaRef}
              value={copy}
              onChange={(event) => {
                setCopy(event.target.value);
                changeDraft();
              }}
              placeholder="Pega aquí el post, anuncio o mensaje que quieres poner a prueba…"
              maxLength={1200}
              aria-label="Copy para simular"
            />
            <div className="composer-foot">
              <span>{copy.length} / 1.200</span>
              <button
                className="simulate-button"
                type="button"
                onClick={runSimulation}
                disabled={isSimulating}
              >
                {isSimulating ? (
                  <>
                    <LoaderCircle className="spin" size={17} /> Simulando…
                  </>
                ) : submitted ? (
                  <>
                    <Check size={17} /> Reacción simulada
                  </>
                ) : (
                  <>
                    <Send size={17} /> {reaccion ? "Simular variante" : "Simular reacción"}
                  </>
                )}
              </button>
            </div>
            <p className="panel-cost-note">
              Hasta {panelSize * rounds * iterations + 1} llamadas: {panelSize} agentes × {rounds} rondas × {iterations} corridas, más la síntesis.
              {panelSize > 12 ? " Un panel grande tarda más y aumenta el costo." : ""}
              {" "}Las variantes conservan el mismo jurado para que el cambio de score sea comparable.
            </p>
          </div>
          </div>
          <AgentPreview resumen={resumen} perfil={perfil} />
          {simulationError ? (
            <p className="form-error workspace-stage__error" role="alert">
              {simulationError}
            </p>
          ) : null}
        </div>

        {reaccion ? (
          <PanelResult
            key={reaccion.corridaId}
            result={reaccion}
            onUseAsVariant={useAsVariant}
          />
        ) : null}

        <div className="workspace-foot">
          <RunHistory
            runs={runs}
            activeId={reaccion?.corridaId}
            loadingId={loadingRunId}
            onOpen={openRun}
          />
          <div className="signal-strip">
            <div>
              <Users size={17} />
              <span>
                <strong>{resumen?.totalContacts ?? 0} voces</strong>
                <small>de tu red extendida</small>
              </span>
            </div>
            <div>
              <Network size={17} />
              <span>
                <strong>{resumen?.totalArchetypes ?? 0} comunidades</strong>
                <small>con contexto diferente</small>
              </span>
            </div>
            <div>
              <Sparkles size={17} />
              <span>
                <strong>Alta fidelidad</strong>
                <small>basada en señales reales</small>
              </span>
            </div>
          </div>
        </div>
      </div>
      </main>
  );
}

export default function App() {
  const [screen, setScreen] = useState("onboarding");
  const [runId, setRunId] = useState(null);
  // El perfil sobrevive al cambio de pantalla: el mapa lo necesita para
  // pedir SU red y no la del ultimo que haya corrido una extraccion.
  const [perfil, setPerfil] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const start = async ({ profileUrl }) => {
    setBusy(true);
    setError("");
    setPerfil(profileUrl);
    try {
      // Solo se reutiliza una red que ya tenga el snapshot enriquecido que
      // necesita el panel: volver a scrapear lo que ya esta cuesta plata.
      const existing = await fetchProfileCoverage({ perfil: profileUrl }).catch(() => null);
      if (existing?.audienciaActiva && existing.enriquecidas >= 3) {
        setScreen("workspace");
        return;
      }

      const run = await startNetworkRun({ profileUrl });
      setRunId(run.runId);
      setScreen("loading");
    } catch (err) {
      // El detalle tecnico va a consola; al usuario se le dice que hacer.
      console.error(err);
      // La red se arma desde quien comenta y reacciona en tus posts publicos.
      // Si el perfil no publica seguido, no hay interacciones que leer.
      setError(
        "No pudimos leer tu red desde tus publicaciones. Si el perfil no publica seguido no hay interacciones que leer todavia.",
      );
    } finally {
      setBusy(false);
    }
  };

  const fail = (message) => {
    setError(message);
    setScreen("onboarding");
  };

  const reset = () => {
    setRunId(null);
    setError("");
    // Tambien el perfil: si no, volver al inicio y cargar otro dejaba el mapa
    // del anterior colgado en pantalla.
    setPerfil("");
    setScreen("onboarding");
  };

  if (screen === "loading") {
    return (
      <LoadingProfile
        runId={runId}
        onComplete={(run) => {
          setPerfil(run.perfilUrl ?? perfil);
          setScreen("workspace");
        }}
        onError={fail}
      />
    );
  }
  if (screen === "workspace") return <Workspace onReset={reset} perfil={perfil} />;
  return <Onboarding onSubmit={start} busy={busy} remoteError={error} />;
}
