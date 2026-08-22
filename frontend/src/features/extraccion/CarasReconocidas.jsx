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

export default CarasReconocidas;
