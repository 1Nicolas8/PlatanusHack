import { History } from 'lucide-react';

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

export default RunHistory;
