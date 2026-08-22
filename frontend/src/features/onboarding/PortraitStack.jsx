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

export default PortraitStack;
