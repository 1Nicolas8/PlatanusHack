import { useEffect, useState } from 'react';
import { Check, LoaderCircle } from 'lucide-react';
import Header from '../../shared/Header';
import CarasReconocidas from './CarasReconocidas';
import { waitForNetworkRun } from '../../api';

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

export default LoadingProfile;
