const { buildPersona } = require('../panel.persona');

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

describe('la ficha con los silencios', () => {
  const posts = [
    { id: '1', texto: 'Cómo pusimos precio a la v1', fecha: '2026-01-01', ordenCronologico: 1 },
    { id: '2', texto: 'Contratamos al primer vendedor', fecha: '2026-02-01', ordenCronologico: 2 },
    { id: '3', texto: 'Lo que aprendimos del churn', fecha: '2026-03-01', ordenCronologico: 3 },
  ];

  const selectivo = {
    id: '9',
    nombre: 'Ana Ruiz',
    headline: 'CTO',
    fechaContacto: null,
    interacciones: 1,
    reaccionesPorTipo: { like: 1 },
    historialObservado: [
      { tipo: 'like', subtipo: 'celebrate', postId: '1', orden: 1, fecha: '2026-01-01', hook: 'Cómo pusimos precio a la v1' },
    ],
    perfil: {},
  };

  it('dice a cuántas publicaciones reaccionó sobre cuántas tuvo enfrente', () => {
    const { ficha, comportamiento } = buildPersona(selectivo, { posts });

    expect(ficha).toMatch(/De las 3 publicaciones suyas que conocemos, reaccionaste a 1/);
    expect(comportamiento).toMatchObject({ oportunidades: 3, postsConReaccion: 1, tasa: 0.333 });
  });

  it('nombra las publicaciones que dejó pasar, que es la mitad que faltaba', () => {
    const { ficha, comportamiento } = buildPersona(selectivo, { posts });

    expect(ficha).toMatch(/seguiste de largo:/);
    expect(ficha).toMatch(/Lo que aprendimos del churn/);
    expect(comportamiento.ignorados).toHaveLength(2);
  });

  it('marca lo que esta persona nunca hizo con vos', () => {
    const { ficha } = buildPersona(selectivo, { posts });

    expect(ficha).toMatch(/Nunca le comentaste/);
    expect(ficha).toMatch(/Nunca compartiste nada suyo/);
    expect(ficha).toMatch(/Hace 2 publicaciones suyas que no reaccionás/);
  });

  it('a quien nunca reaccionó no le inventa una frecuencia, pero sí le muestra lo que ignoró', () => {
    const frio = { ...selectivo, interacciones: 0, reaccionesPorTipo: {}, historialObservado: [] };
    const { ficha, comportamiento } = buildPersona(frio, { posts });

    expect(ficha).toMatch(/Nunca reaccionaste a nada suyo/);
    expect(ficha).toMatch(/no reaccionaste a ninguna/);
    expect(ficha).not.toMatch(/Cuando reaccionás a algo suyo/);
    expect(comportamiento).toMatchObject({ postsConReaccion: 0, tasa: 0, brechaPosts: null });
  });

  it('sin publicaciones cargadas no afirma nada sobre frecuencia', () => {
    const { ficha, comportamiento } = buildPersona(selectivo, { posts: [] });

    expect(ficha).not.toMatch(/publicaciones suyas que/);
    expect(comportamiento).toMatchObject({ oportunidades: null, ignorados: [] });
  });

  it('recorta la ventana a lo publicado desde que se conectaron', () => {
    const reciente = { ...selectivo, fechaContacto: '2026-02-15', historialObservado: [], interacciones: 0 };
    const { comportamiento } = buildPersona(reciente, { posts });

    // Solo vio el tercero: juzgarlo contra los tres lo haría parecer más selectivo.
    expect(comportamiento).toMatchObject({ oportunidades: 1, oportunidadesEstimadas: false });
  });
});
