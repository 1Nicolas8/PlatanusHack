import { useState } from 'react';
import { ArrowRight, LockKeyhole } from 'lucide-react';
import Header from '../../shared/Header';
import PortraitStack from './PortraitStack';

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
          <span>01</span> la memoria de tu red
        </div>
        <h1 className="reveal reveal--two">
          Publicar no tiene que ser
          <br />
          <em>una apuesta a ciegas.</em>
        </h1>
        <p className="hero-copy reveal reveal--three">
          Hippocamp construye gemelos digitales de tus conexiones reales,
          entrenados con su historial de reacciones, y simula cómo responderían
          a tu copy antes de que salga a producción.
        </p>

        <section className="evidence reveal reveal--four" aria-label="El problema">
          <p className="evidence-kicker">El problema</p>
          <ul className="evidence-grid">
            <li>
              <strong>70%+</strong>
              <p>de founders quiere construir marca personal — pero solo el 6% ejecuta</p>
            </li>
            <li>
              <strong>72%</strong>
              <p>no logra crear contenido atractivo, aun destinando 45% del presupuesto a contenido</p>
            </li>
            <li>
              <strong>35%</strong>
              <p>de los marketers cita lograr alto engagement como su reto #1 de contenido</p>
            </li>
            <li>
              <strong>76x</strong>
              <p>más likes entre dos posts idénticos según el hook usado en el copy</p>
            </li>
          </ul>
          <p className="evidence-note">
            Sin una forma de simular cómo reaccionaría su propia red antes de
            publicar, deciden a ciegas — probando a mano, con presupuesto y
            tiempo que no tienen de sobra.
          </p>
          <p className="evidence-source">
            Fuente: Marketing in Asia — MediaNews4U · HubSpot State of Marketing
            2026 · Podawaa
          </p>
        </section>

        <form
          className="linkedin-form reveal reveal--five"
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
      <footer className="onboarding-footer">
        <span>HECHO PARA ENCONTRAR LA VERDAD ANTES DE PUBLICAR</span>
        <i />
      </footer>
    </main>
  );
}

export default Onboarding;
