import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, LoaderCircle, Network, Send, Sparkles, Users } from 'lucide-react';
import Header from '../../shared/Header';
import AgentPreview from '../panel/AgentPreview';
import PanelResult from '../panel/PanelResult';
import RunHistory from '../panel/RunHistory';
import { profileHandle } from '../../shared/profile';
import { hydratePanelRun, reactionsIndex } from '../panel/panel.model';
import { evaluatePanel, fetchPanelRun, fetchPanelRuns, fetchResumenAudiencia } from '../../api';

const exampleCopy =
  "La mayoría de equipos no necesita más datos. Necesita saber cuál señal merece atención. Construimos Hippocamp para probar tu mensaje antes de publicarlo.";


function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function launchCopySpark({ stage, from, spark }) {
  if (!stage || !from || !spark || prefersReducedMotion()) return 0
  const to = stage.querySelector('.neural-node--core')
  if (!to) return 0
  const box = stage.getBoundingClientRect()
  const origin = from.getBoundingClientRect()
  const target = to.getBoundingClientRect()
  const x0 = origin.left + origin.width / 2 - box.left - 6
  const y0 = origin.top + origin.height / 2 - box.top - 6
  const x1 = target.left + target.width / 2 - box.left - 6
  const y1 = target.top + target.height / 2 - box.top - 6
  const mx = x0 + (x1 - x0) * 0.48
  const my = y0 + (y1 - y0) * 0.42 - 52
  spark.animate(
    [
      { opacity: 1, transform: `translate(${x0}px, ${y0}px) scale(0.3)` },
      { opacity: 1, transform: `translate(${mx}px, ${my}px) scale(1.05)` },
      { opacity: 0, transform: `translate(${x1}px, ${y1}px) scale(1.65)` },
    ],
    { duration: 620, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' },
  )
  return 380
}

function Workspace({ onReset, perfil, arrival = null, onSimulating }) {
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
  const [forming, setForming] = useState(arrival != null);
  const [broadcast, setBroadcast] = useState(0);
  const textareaRef = useRef(null);
  const stageRef = useRef(null);
  const simulateRef = useRef(null);
  const sparkRef = useRef(null);
  const waveTimer = useRef(0);
  const onArrived = useCallback(() => setForming(false), []);

  useEffect(() => () => window.clearTimeout(waveTimer.current), []);

  useEffect(() => {
    onSimulating?.(isSimulating);
    return () => onSimulating?.(false);
  }, [isSimulating, onSimulating]);

  useEffect(() => {
    let cancelled = false;
    fetchResumenAudiencia({ perfil, limit: 20 })
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
    const delay = launchCopySpark({
      stage: stageRef.current,
      from: simulateRef.current,
      spark: sparkRef.current,
    });
    window.clearTimeout(waveTimer.current);
    waveTimer.current = window.setTimeout(() => setBroadcast((n) => n + 1), delay);
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
        <div className="workspace-stage" ref={stageRef}>
          <span className="copy-spark" ref={sparkRef} aria-hidden="true" />
          <div className="workspace-hero">
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
                ref={simulateRef}
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
            {simulationError ? (
              <p className="form-error workspace-stage__error" role="alert">
                {simulationError}
              </p>
            ) : null}
          </div>
          <AgentPreview
            resumen={resumen}
            perfil={perfil}
            arrival={arrival}
            arrive={forming}
            listening={isSimulating}
            reactions={reactionsIndex(reaccion?.panel)}
            broadcast={broadcast}
            onArrived={onArrived}
          />
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
          {reaccion ? (
            <PanelResult
              key={reaccion.corridaId}
              result={reaccion}
              onUseAsVariant={useAsVariant}
            />
          ) : null}
        </div>
      </div>
      </main>
  );
}

export default Workspace;
