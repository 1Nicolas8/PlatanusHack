/**
 * Enrutado entre pantallas y el unico estado que las tres comparten.
 *
 * Cada pantalla vive en su feature: onboarding, extraccion y workspace. Aca
 * queda lo que ninguna puede resolver sola — que pantalla se muestra, de quien
 * es el perfil, y como se pasa de una a la otra.
 */

import { useState } from 'react';
import ConnectionField from './shared/ConnectionField';
import Onboarding from './features/onboarding/Onboarding';
import LoadingProfile from './features/extraccion/LoadingProfile';
import Workspace from './features/workspace/Workspace';
import { fetchProfileCoverage, startNetworkRun } from './api';

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

  const page =
    screen === "loading" ? (
      <LoadingProfile
        runId={runId}
        onComplete={(run) => {
          setPerfil(run.perfilUrl ?? perfil);
          setScreen("workspace");
        }}
        onError={fail}
      />
    ) : screen === "workspace" ? (
      <Workspace onReset={reset} perfil={perfil} />
    ) : (
      <Onboarding onSubmit={start} busy={busy} remoteError={error} />
    );

  return (
    <>
      <ConnectionField mood={screen} />
      {page}
    </>
  );
}
