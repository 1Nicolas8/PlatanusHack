const { selectCandidatePool, buildPersona } = require('../panel.persona');

function candidate(index) {
  return {
    id: String(index),
    nombre: `Persona ${index}`,
    headline: `Rol ${index % 20}`,
    interacciones: index % 7 === 0 ? 1 : 0,
    perfil: {
      cargoActual: `Rol ${index % 20}`,
      empresaActual: `Empresa ${index % 25}`,
      ubicacion: index % 2 ? 'Bogotá' : 'Medellín',
      gradoGrafo: index % 30,
      conexiones: 100 + index,
    },
  };
}

describe('selectCandidatePool', () => {
  const candidates = Array.from({ length: 260 }, (_, index) => candidate(index));

  it('limita a 200 y es reproducible con la misma semilla', () => {
    const first = selectCandidatePool({ candidates, seed: 'perfil-1' });
    const second = selectCandidatePool({ candidates, seed: 'perfil-1' });

    expect(first).toHaveLength(200);
    expect(first.map((item) => item.id)).toEqual(second.map((item) => item.id));
  });

  it('cubre todas las empresas antes de repetir la siguiente ronda', () => {
    const selected = selectCandidatePool({ candidates, limit: 25, seed: 'perfil-1' });
    expect(new Set(selected.map((item) => item.perfil.empresaActual)).size).toBe(25);
  });
});

describe('buildPersona con historial observado', () => {
  it('la ficha dice qué post celebró y cuándo, no solo cuántas veces', () => {
    const persona = buildPersona({
      id: '7',
      nombre: 'Bryan Riaño',
      headline: 'AI & Systems Engineer',
      interacciones: 2,
      historialObservado: [{
        tipo: 'like',
        subtipo: 'celebrate',
        fecha: '2026-05-31T17:32:33.577Z',
        hook: 'We won the first GTM Hackathon in LATAM.',
      }],
      perfil: { cargoActual: 'Engineer' },
    });

    expect(persona.ficha).toContain('celebraste');
    expect(persona.ficha).toContain('2026-05-31');
    expect(persona.ficha).toContain('GTM Hackathon');
    expect(persona.estrato).toBe('nucleo');
  });
});
