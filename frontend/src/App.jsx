import { useEffect, useRef, useState } from 'react'
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
} from 'lucide-react'
import {
  fetchResumenAudiencia,
  fetchSimulacionReaccion,
  startNetworkRun,
  waitForNetworkRun,
} from './api'

const SAMPLE_URL = 'https://www.linkedin.com/in/pepito-perez'

function Brand() {
  return (
    <a className="brand" href="#top" aria-label="Hippocamp, inicio">
      <span className="brand-mark" aria-hidden="true">H</span>
      <span>hippocamp</span>
    </a>
  )
}

function Avatar({ profile, className }) {
  const initials = profile?.nombre ? initialsOf(profile.nombre) : '?'

  return profile?.fotoUrl ? (
    <img className={className} src={profile.fotoUrl} alt="" />
  ) : <span className={className}>{initials}</span>
}

function Header({ compact = false, onReset, profile }) {
  return (
    <header className={`site-header ${compact ? 'site-header--compact' : ''}`}>
      <Brand />
      {compact ? (
        <button className="profile-pill" type="button" onClick={onReset}>
          <Avatar className="mini-avatar" profile={profile} />
          <span>{profile?.nombre ?? 'Perfil analizado'}</span>
          <ChevronDown size={15} strokeWidth={1.8} />
        </button>
      ) : (
        <div className="header-note"><span className="status-dot" /> simulación privada</div>
      )}
    </header>
  )
}

function PortraitStack() {
  const people = [
    'portrait portrait--one',
    'portrait portrait--two',
    'portrait portrait--three',
    'portrait portrait--count',
  ]

  return (
    <div className="portrait-row">
      <div className="portrait-stack">
        {people.map((className) => <span aria-hidden="true" className={className} key={className} />)}
      </div>
      <p><strong>Personas, no promedios.</strong><br />Cada reacción conserva una historia.</p>
    </div>
  )
}

function Onboarding({ onSubmit, busy, remoteError }) {
  const [url, setUrl] = useState('')
  const [icp, setIcp] = useState('')
  const [error, setError] = useState('')

  const submit = (event) => {
    event.preventDefault()
    const candidate = url.trim()
    if (!/^https?:\/\/(www\.)?linkedin\.com\/in\/[\w%_-]+\/?(?:\?.*)?$/i.test(candidate)) {
      setError('Pega una URL de perfil de LinkedIn válida, por ejemplo linkedin.com/in/tu-nombre.')
      return
    }
    // Sin ICP no se puede clasificar la red: preferimos pedirlo a inventarlo.
    if (icp.trim().length < 3) {
      setError('Contanos a quién le vendés para poder clasificar tu red.')
      return
    }
    setError('')
    onSubmit({ profileUrl: candidate, icp: icp.trim() })
  }

  return (
    <main className="onboarding" id="top">
      <Header />
      <section className="hero">
        <div className="eyebrow reveal reveal--one"><span>01</span> construyamos tu audiencia</div>
        <h1 className="reveal reveal--two">Antes de probar tu mensaje,<br /><em>déjanos conocerte.</em></h1>
        <p className="hero-copy reveal reveal--three">
          Tu red ya sabe qué te funciona. Leemos las señales de tu perfil para crear una audiencia sintética tan particular como la real.
        </p>

        <form className="linkedin-form reveal reveal--four" onSubmit={submit} noValidate>
          <label htmlFor="linkedin-url">Tu perfil de LinkedIn</label>
          <div className={`input-shell ${error ? 'input-shell--error' : ''}`}>
            <span className="linkedin-glyph" aria-hidden="true">in</span>
            <input
              id="linkedin-url"
              type="url"
              value={url}
              onChange={(event) => { setUrl(event.target.value); setError('') }}
              placeholder="linkedin.com/in/tu-nombre"
              autoComplete="url"
              aria-describedby={error ? 'url-error' : 'privacy-note'}
              aria-invalid={Boolean(error)}
            />
            <button type="submit" aria-label="Analizar perfil"><ArrowRight size={20} /></button>
          </div>
          <label htmlFor="icp-input">¿A quién le vendés?</label>
          <div className="input-shell">
            <input
              id="icp-input"
              type="text"
              value={icp}
              onChange={(event) => { setIcp(event.target.value); setError('') }}
              placeholder="Dueños de restaurantes de 5 a 50 empleados"
              disabled={busy}
            />
          </div>
          {error || remoteError ? <p className="form-error" id="url-error">{error || remoteError}</p> : null}
          <div className="form-foot" id="privacy-note">
            <span><LockKeyhole size={13} /> Solo usamos información pública</span>
            <button type="button" className="example-link" onClick={() => setUrl(SAMPLE_URL)}>Probar con un ejemplo</button>
          </div>
        </form>

        <PortraitStack />
      </section>
      <div className="orbit orbit--one" aria-hidden="true" />
      <div className="orbit orbit--two" aria-hidden="true" />
      <footer className="onboarding-footer"><span>HECHO PARA ENCONTRAR LA VERDAD ANTES DE PUBLICAR</span><i /></footer>
    </main>
  )
}

const LOAD_STEPS = [
  ['Leyendo tu trayectoria', 'Roles, industrias y temas que te importan'],
  ['Mapeando tu red', 'Conexiones, comunidades y cercanía'],
  ['Entendiendo las señales', 'Reacciones, comentarios y patrones de contenido'],
  ['Preparando tus agentes', 'Voces plausibles, contexto y criterio propio'],
]

function LoadingProfile({ onComplete, runId, onError, profile }) {
  const [activeStep, setActiveStep] = useState(0)

  // La animación avanza hasta el anteúltimo paso y espera ahí: el último lo
  // marca la corrida real, no un temporizador. Sin esto la pantalla diria
  // "listo" mientras el actor todavia esta trabajando.
  useEffect(() => {
    const interval = window.setInterval(() => {
      setActiveStep((current) => Math.min(current + 1, LOAD_STEPS.length - 2))
    }, 720)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!runId) return undefined
    let cancelled = false

    waitForNetworkRun(runId)
      .then((run) => {
        if (cancelled) return
        setActiveStep(LOAD_STEPS.length - 1)
        window.setTimeout(() => onComplete(run), 650)
      })
      .catch((err) => { if (!cancelled) onError(err.message) })

    return () => { cancelled = true }
  }, [runId, onComplete, onError])

  return (
    <main className="loading-page">
      <Header />
      <section className="loading-card" aria-live="polite">
        <div className="scan-portrait">
          <Avatar className="scan-portrait__avatar" profile={profile} />
          <i />
        </div>
        <div>
          <div className="eyebrow"><span>02</span> aprendiendo de ti</div>
          <h1>Estamos convirtiendo<br />tu red en una <em>audiencia.</em></h1>
        </div>
        <div className="steps-list">
          {LOAD_STEPS.map(([title, detail], index) => (
            <div className={`load-step ${index < activeStep ? 'is-done' : ''} ${index === activeStep ? 'is-active' : ''}`} key={title}>
              <span className="step-icon">
                {index < activeStep ? <Check size={15} /> : index === activeStep ? <LoaderCircle size={15} /> : index + 1}
              </span>
              <span><strong>{title}</strong><small>{detail}</small></span>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}

const exampleCopy = 'La mayoría de equipos no necesita más datos. Necesita saber cuál señal merece atención. Construimos Hippocamp para probar tu mensaje antes de publicarlo.'

function initialsOf(nombre) {
  return nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')
}

function AgentPreview({ resumen }) {
  const quotes = resumen?.topContacts?.filter((c) => c.sampleComment).slice(0, 2)
  const contactCount = typeof resumen?.totalContacts === 'number' ? resumen.totalContacts : null

  return (
    <aside className="agent-preview">
      <div className="agent-preview__header">
        <span className="live-dot" /> audiencia lista
        <span>{contactCount === null ? 'Cargando contactos…' : `${contactCount} contactos`}</span>
      </div>
      <div className="network-map" aria-hidden="true">
        <svg viewBox="0 0 410 210" role="img">
          <g className="network-lines">
            <path d="M55 67 L143 40 L207 96 L300 45 L364 96" />
            <path d="M55 67 L114 151 L207 96 L251 169 L364 96" />
            <path d="M143 40 L114 151 L251 169 L300 45" />
          </g>
          <g className="network-nodes">
            <circle cx="55" cy="67" r="19" /><circle cx="143" cy="40" r="14" />
            <circle className="core" cx="207" cy="96" r="26" /><circle cx="300" cy="45" r="18" />
            <circle cx="364" cy="96" r="13" /><circle cx="114" cy="151" r="17" /><circle cx="251" cy="169" r="20" />
          </g>
          <g className="network-labels">
            <text x="207" y="101">TÚ</text><text x="55" y="71">MC</text><text x="300" y="49">AR</text>
          </g>
        </svg>
        <div className="map-caption"><Network size={15} /> Construidos a partir de tu contexto real</div>
      </div>
      <div className="agent-quotes">
        {quotes?.length ? quotes.map((quote, index) => (
          <article key={quote.nombre}>
            <span className={`agent-avatar ${index % 2 === 0 ? 'agent-avatar--olive' : ''}`}>{initialsOf(quote.nombre)}</span>
            <div><strong>{quote.nombre}</strong><small>{quote.headline ?? quote.arquetipo ?? ''}</small><p>“{quote.sampleComment}”</p></div>
          </article>
        )) : <p className="agent-quotes__empty">No hay comentarios reales disponibles para mostrar todavía.</p>}
      </div>
    </aside>
  )
}

function AgentProfileDetail({ item }) {
  const profile = item.perfil
  if (!profile) return null

  const { arquetipo, calibracion, historialReacciones = [], prompt, respuestaLLM } = profile
  const llmResponse = typeof respuestaLLM === 'string'
    ? respuestaLLM
    : JSON.stringify(respuestaLLM, null, 2)

  return (
    <div className="agent-profile-detail">
      <p><b>Identidad:</b> {item.nombre} · {item.headline || 'Sin headline'} · {item.arquetipo}</p>
      <div>
        <b>Arquetipo: {arquetipo?.nombre}</b>
        <p>{arquetipo?.descripcion}</p>
        <dl>
          <dt>Awareness</dt><dd>{arquetipo?.awareness}</dd>
          <dt>Objeciones</dt><dd>{arquetipo?.objeciones}</dd>
          <dt>Pain points</dt><dd>{arquetipo?.painPoints}</dd>
          <dt>Sensibilidad al precio</dt><dd>{arquetipo?.sensibilidadPrecio}</dd>
          <dt>Intención de compra</dt><dd>{arquetipo?.intencionCompra}</dd>
        </dl>
      </div>
      <p><b>Calibración:</b> tasa {calibracion?.tasaCalibrada} · {calibracion?.nivel} · {calibracion?.reaccionesObservadas} reacciones observadas</p>
      <div>
        <b>Historial de reacciones reales</b>
        {historialReacciones.length ? (
          <ul>
            {historialReacciones.map((reaction) => (
              <li key={`${reaction.postId}-${reaction.tipo}-${reaction.textoComentario || ''}`}>
                <strong>{reaction.postTitulo}</strong> · {reaction.tipo}
                {reaction.textoComentario ? `: “${reaction.textoComentario}”` : ''}
              </li>
            ))}
          </ul>
        ) : <p>Sin reacciones registradas.</p>}
      </div>
      <div className="agent-profile-detail__llm">
        <b>Prompt exacto enviado al LLM</b>
        <pre>{prompt}</pre>
        <b>Respuesta del LLM</b>
        <pre>{llmResponse}</pre>
      </div>
    </div>
  )
}

function Workspace({ onReset, profile }) {
  const [copy, setCopy] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [resumen, setResumen] = useState(null)
  const [reaccion, setReaccion] = useState(null)
  const [simulationError, setSimulationError] = useState('')
  const [isSimulating, setIsSimulating] = useState(false)
  const [expandedAgent, setExpandedAgent] = useState(null)
  const textareaRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    fetchResumenAudiencia()
      .then((data) => { if (!cancelled) setResumen(data) })
      .catch((error) => console.warn('No se pudo cargar el resumen de audiencia:', error.message))
    return () => { cancelled = true }
  }, [])

  const runSimulation = async () => {
    if (!copy.trim()) {
      textareaRef.current?.focus()
      return
    }
    setIsSimulating(true)
    setSimulationError('')
    try {
      const data = await fetchSimulacionReaccion({ copy: copy.trim() })
      setReaccion(data)
      setExpandedAgent(null)
      setSubmitted(true)
    } catch {
      setSimulationError('No pudimos simular la reacción. Intenta de nuevo.')
    } finally {
      setIsSimulating(false)
    }
  }

  return (
    <main className="workspace">
      <Header compact onReset={onReset} profile={profile} />
      <div className="workspace-grid">
        <section className="copy-studio">
          <div className="welcome-line"><span className="success-seal"><Check size={18} /></span><span>Perfil entendido</span></div>
          <h1>{profile?.nombre ? `Hola, ${profile.nombre.split(' ')[0]}.` : 'Tu perfil está listo.'}<br /><em>Probemos tu copy.</em></h1>
          <p className="studio-intro">Tu audiencia ya está en la sala. Pega el mensaje que estás considerando publicar y escucha lo que realmente les provoca.</p>

          <div className={`composer ${submitted ? 'composer--submitted' : ''}`}>
            <div className="composer-top">
              <span className="composer-label">Tu mensaje</span>
              <button type="button" onClick={() => setCopy(exampleCopy)}><Sparkles size={14} /> Usar ejemplo</button>
            </div>
            <textarea
              ref={textareaRef}
              value={copy}
              onChange={(event) => { setCopy(event.target.value); setSubmitted(false); setReaccion(null); setExpandedAgent(null); setSimulationError('') }}
              placeholder="Pega aquí el post, anuncio o mensaje que quieres poner a prueba…"
              maxLength={1200}
              aria-label="Copy para simular"
            />
            <div className="composer-foot">
              <span>{copy.length} / 1.200</span>
              <button className="simulate-button" type="button" onClick={runSimulation} disabled={isSimulating}>
                {isSimulating ? <><LoaderCircle className="spin" size={17} /> Simulando…</> : submitted ? <><Check size={17} /> Reacción simulada</> : <><Send size={17} /> Simular reacción</>}
              </button>
            </div>
          </div>
          {simulationError ? <p className="form-error" role="alert">{simulationError}</p> : null}
          {reaccion ? (
            <section className="reaction-result" aria-live="polite">
              <strong>{reaccion.resumen.likes} likes · {reaccion.resumen.comentarios} comentarios · {reaccion.resumen.ignorados} ignorados</strong>
              {reaccion.porArquetipo.slice(0, 2).map((item) => <p key={item.arquetipo}><b>{item.arquetipo}:</b> “{item.comentarioEjemplo}”</p>)}
              {reaccion.reacciones?.comentarios.length ? (
                <div>
                  <h2>Comentarios de tu red</h2>
                  {reaccion.reacciones.comentarios.map((item) => (
                    <article key={item.connectionId}>
                      <button className="agent-name-button" type="button" onClick={() => setExpandedAgent((current) => current === `comment-${item.connectionId}` ? null : `comment-${item.connectionId}`)} aria-expanded={expandedAgent === `comment-${item.connectionId}`}>
                        {item.nombre}
                      </button>
                      <small>{item.headline} · {item.arquetipo}</small>
                      <p>“{item.comentario}”</p>
                      {expandedAgent === `comment-${item.connectionId}` ? <AgentProfileDetail item={item} /> : null}
                    </article>
                  ))}
                </div>
              ) : null}
              {reaccion.reacciones?.likes.length ? (
                <div className="reaction-likes">
                  <h2>Les gustó</h2>
                  {reaccion.reacciones.likes.map((item) => (
                    <article key={item.connectionId}>
                      <button className="agent-name-button" type="button" onClick={() => setExpandedAgent((current) => current === `like-${item.connectionId}` ? null : `like-${item.connectionId}`)} aria-expanded={expandedAgent === `like-${item.connectionId}`}>
                        {item.nombre}
                      </button>
                      <small>{item.headline} · {item.arquetipo}</small>
                      {expandedAgent === `like-${item.connectionId}` ? <AgentProfileDetail item={item} /> : null}
                    </article>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}
          <div className="signal-strip">
            <div><Users size={17} /><span><strong>{typeof resumen?.totalContacts === 'number' ? `${resumen.totalContacts} voces` : 'Sin datos de audiencia'}</strong><small>de tu red extendida</small></span></div>
            <div><Network size={17} /><span><strong>{typeof resumen?.totalArchetypes === 'number' ? `${resumen.totalArchetypes} comunidades` : 'Sin datos de comunidades'}</strong><small>con contexto diferente</small></span></div>
            <div><Sparkles size={17} /><span><strong>Alta fidelidad</strong><small>basada en señales reales</small></span></div>
          </div>
        </section>
        <AgentPreview resumen={resumen} />
      </div>
    </main>
  )
}

export default function App() {
  const [screen, setScreen] = useState('onboarding')
  const [runId, setRunId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [profile, setProfile] = useState(null)

  const start = async ({ profileUrl, icp }) => {
    setBusy(true)
    setError('')
    try {
      const run = await startNetworkRun({ profileUrl, icp })
      setRunId(run.runId)
      setProfile(run.profile ?? null)
      setScreen('loading')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const fail = (message) => {
    setError(message)
    setScreen('onboarding')
  }

  const reset = () => { setRunId(null); setProfile(null); setError(''); setScreen('onboarding') }

  if (screen === 'loading') {
    return <LoadingProfile runId={runId} profile={profile} onComplete={(run) => { setProfile(run.profile ?? null); setScreen('workspace') }} onError={fail} />
  }
  if (screen === 'workspace') return <Workspace onReset={reset} profile={profile} />
  return <Onboarding onSubmit={start} busy={busy} remoteError={error} />
}
