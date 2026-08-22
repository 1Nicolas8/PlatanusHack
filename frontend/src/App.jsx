import NetworkMap from './NetworkMap'
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  LoaderCircle,
  LockKeyhole,
  Network,
  Send,
  Sparkles,
  Users,
} from "lucide-react";
import {
  evaluatePanel,
  fetchProfileCoverage,
  fetchResumenAudiencia,
  startNetworkRun,
  waitForNetworkRun,
} from "./api";

const SAMPLE_URL = "https://www.linkedin.com/in/pepito-perez";

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
            <button
              type="button"
              className="example-link"
              onClick={() => setUrl(SAMPLE_URL)}
            >
              Probar con un ejemplo
            </button>
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

function LoadingProfile({ onComplete, runId, onError }) {
  const [activeStep, setActiveStep] = useState(0);

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

    waitForNetworkRun(runId)
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
          <span>PP</span>
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

function AgentPreview({ resumen }) {
  const displayQuotes = resumen?.topContacts?.slice(0, 2) ?? [];
  const contactCount = resumen?.totalContacts ?? 0;

  return (
    <aside className="agent-preview">
      <div className="agent-preview__header">
        <span className="live-dot" /> audiencia lista
        <span>{contactCount} contactos</span>
      </div>
      <div className="network-map" aria-hidden="true">
        <svg viewBox="0 0 410 210" role="img">
          <g className="network-lines">
            <path d="M55 67 L143 40 L207 96 L300 45 L364 96" />
            <path d="M55 67 L114 151 L207 96 L251 169 L364 96" />
            <path d="M143 40 L114 151 L251 169 L300 45" />
          </g>
          <g className="network-nodes">
            <circle cx="55" cy="67" r="19" />
            <circle cx="143" cy="40" r="14" />
            <circle className="core" cx="207" cy="96" r="26" />
            <circle cx="300" cy="45" r="18" />
            <circle cx="364" cy="96" r="13" />
            <circle cx="114" cy="151" r="17" />
            <circle cx="251" cy="169" r="20" />
          </g>
          <g className="network-labels">
            <text x="207" y="101">
              TÚ
            </text>
            <text x="55" y="71">
              MC
            </text>
            <text x="300" y="49">
              AR
            </text>
          </g>
        </svg>
        <div className="map-caption">
          <Network size={15} /> Construidos a partir de tu contexto real
        </div>
      </div>
      <div className="agent-quotes">
        {displayQuotes.map((quote, index) => (
          <article key={quote.nombre}>
            <span
              className={`agent-avatar ${index % 2 === 0 ? "agent-avatar--olive" : ""}`}
            >
              {initialsOf(quote.nombre)}
            </span>
            <div>
              <strong>{quote.nombre}</strong>
              <small>{quote.headline ?? quote.arquetipo ?? ""}</small>
              <p>
                {quote.sampleComment
                  ? `“${quote.sampleComment}”`
                  : "Sin reacción observada todavía."}
              </p>
            </div>
          </article>
        ))}
      </div>
      {!displayQuotes.length ? (
        <p className="agent-preview__empty">La audiencia real aparecerá aquí cuando termine la extracción.</p>
      ) : null}
    </aside>
  );
}

function PanelResult({ result }) {
  return (
    <section className="reaction-result panel-result" aria-live="polite">
      <div className="panel-result__headline">
        <span className={`panel-score panel-score--${result.banda.replace(/\s+/g, "-")}`}>{result.score}</span>
        <div>
          <strong>{result.veredicto}</strong>
          <p>
            {result.configuracion.panel} agentes · dispersión {result.dispersion} ·{" "}
            {result.convergio ? "resultado estable" : "caso borde"}
          </p>
        </div>
      </div>

      {result.panel?.length ? (
        <details className="panel-members">
          <summary>Ver los {result.panel.length} agentes del panel</summary>
          <div>
            {result.panel.map((agent) => (
              <article key={agent.id}>
                {agent.fotoUrl ? <img src={agent.fotoUrl} alt="" /> : <span>{initialsOf(agent.nombre)}</span>}
                <div>
                  <strong>{agent.nombre}</strong>
                  <small>{agent.headline || "Sin headline"}</small>
                  <p>{agent.accionDominante || "sin respuesta"} · score {agent.scoreMedio ?? "—"}</p>
                </div>
              </article>
            ))}
          </div>
        </details>
      ) : null}

      {result.objeciones?.length ? (
        <div>
          <h2>Qué los frena</h2>
          <ul className="panel-objections">
            {result.objeciones.slice(0, 6).map((item) => (
              <li key={item.texto}>
                <strong>{item.veces}×</strong> {item.texto} <small>— {item.de}</small>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.comentarios?.length ? (
        <div>
          <h2>Lo que diría tu red</h2>
          {result.comentarios.slice(0, 6).map((item, index) => (
            <article key={`${item.nombre}-${item.iteracion}-${index}`}>
              <strong>{item.nombre}</strong>
              <small>{item.headline}</small>
              <p>“{item.comentario}”</p>
            </article>
          ))}
        </div>
      ) : null}

      {result.mejoras ? (
        <div className="panel-improvements">
          <h2>Cómo lo mejoraría el panel</h2>
          <p>{result.mejoras.diagnostico}</p>
          <ul>
            {result.mejoras.mejoras.map((item) => (
              <li key={item.cambio}>
                <strong>{item.cambio}</strong> — {item.porQue}
              </li>
            ))}
          </ul>
          <h3>Copy sugerido</h3>
          <blockquote>{result.mejoras.copySugerido}</blockquote>
        </div>
      ) : null}

      <p className="panel-reading-note">{result.comoLeerlo}</p>
    </section>
  );
}

function Workspace({ onReset, perfil }) {
  const [copy, setCopy] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [resumen, setResumen] = useState(null);
  const [reaccion, setReaccion] = useState(null);
  const [panelSize, setPanelSize] = useState(12);
  const [simulationError, setSimulationError] = useState("");
  const [isSimulating, setIsSimulating] = useState(false);
  const textareaRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    fetchResumenAudiencia({ perfil })
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

  const runSimulation = async () => {
    if (!copy.trim()) {
      textareaRef.current?.focus();
      return;
    }
    setIsSimulating(true);
    setSimulationError("");
    try {
      const data = await evaluatePanel({ perfil, copy: copy.trim(), panel: panelSize });
      setReaccion(data);
      setSubmitted(true);
    } catch {
      setSimulationError("No pudimos reunir el panel. Intenta de nuevo.");
    } finally {
      setIsSimulating(false);
    }
  };

  return (
    <main className="workspace">
      <Header compact onReset={onReset} perfil={perfil} />
      <div className="workspace-grid">
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
                      setSubmitted(false);
                      setReaccion(null);
                    }}
                    disabled={isSimulating}
                  />
                  <output>{panelSize}</output>
                </label>
                <button type="button" onClick={() => setCopy(exampleCopy)}>
                  <Sparkles size={14} /> Usar ejemplo
                </button>
              </div>
            </div>
            <textarea
              ref={textareaRef}
              value={copy}
              onChange={(event) => {
                setCopy(event.target.value);
                setSubmitted(false);
                setReaccion(null);
                setSimulationError("");
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
                    <Send size={17} /> Simular reacción
                  </>
                )}
              </button>
            </div>
            <p className="panel-cost-note">
              Hasta {panelSize * 2 * 3 + 1} llamadas: {panelSize} agentes × 2 rondas × 3 iteraciones, más la síntesis.
              {panelSize > 12 ? " Un panel grande tarda más y aumenta el costo." : ""}
            </p>
          </div>
          {simulationError ? (
            <p className="form-error" role="alert">
              {simulationError}
            </p>
          ) : null}
          {reaccion ? <PanelResult result={reaccion} /> : null}
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
        </section>
        <AgentPreview resumen={resumen} />
      </div>
          <NetworkMap perfil={perfil} />
      </main>
  );
}

export default function App() {
  const [screen, setScreen] = useState("onboarding");
  const [runId, setRunId] = useState(null);
  const [activeProfile, setActiveProfile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const start = async ({ profileUrl }) => {
    setBusy(true);
    setError("");
    setActiveProfile(profileUrl);
    try {
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
      setError(
        "No pudimos leer tu red todavia. Si ya la cargaste, reintenta en unos segundos; si no, falta conectar la fuente de datos.",
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
    setActiveProfile(null);
    setError("");
    setScreen("onboarding");
  };

  if (screen === "loading") {
    return (
      <LoadingProfile
        runId={runId}
        onComplete={(run) => {
          setActiveProfile(run.perfilUrl ?? activeProfile);
          setScreen("workspace");
        }}
        onError={fail}
      />
    );
  }
  if (screen === "workspace") return <Workspace onReset={reset} perfil={activeProfile} />;
  return <Onboarding onSubmit={start} busy={busy} remoteError={error} />;
}
