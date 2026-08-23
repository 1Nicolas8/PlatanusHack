const {
  exponerPrimerSalto,
  exponerSegundoSalto,
  metricasObservadas,
  estimarExpuestos,
} = require('../panel.exposicion');

function makePosts(reacciones) {
  return reacciones.map((totalReacciones, i) => ({
    id: String(i + 1),
    texto: `Publicación ${i + 1}`,
    fecha: `2026-0${i + 1}-01`,
    ordenCronologico: i + 1,
    impresiones: null,
    totalReacciones,
    compartidos: 0,
    interaccionesSociales: 1,
  }));
}

function makeCandidates(n, { activos = 0, grado = 1 } = {}) {
  return Array.from({ length: n }, (unused, i) => ({
    id: String(i + 1),
    nombre: `Contacto ${i + 1}`,
    headline: `Headline ${i + 1}`,
    fechaContacto: null,
    grado,
    interacciones: i < activos ? 2 : 0,
    reaccionesPorTipo: i < activos ? { like: 2 } : {},
    historialObservado: i < activos ? [{ tipo: 'like', postId: '1', orden: 1, hook: 'Publicación 1' }] : [],
    perfil: {},
  }));
}

describe('metricasObservadas', () => {
  it('promedia solo sobre los posts que traen la métrica', () => {
    const posts = [
      { totalReacciones: 10, interaccionesSociales: 2, compartidos: 1, impresiones: null },
      { totalReacciones: null, interaccionesSociales: null, compartidos: null, impresiones: null },
      { totalReacciones: 20, interaccionesSociales: 4, compartidos: 1, impresiones: null },
    ];

    // Un post sin número no es un post con cero: si contara los tres, daría 10.
    expect(metricasObservadas(posts)).toMatchObject({
      posts: 3,
      postsConMetrica: 2,
      reaccionesPromedio: 15,
    });
  });
});

describe('estimarExpuestos', () => {
  it('despeja las impresiones desde las reacciones reales cuando LinkedIn no las da', () => {
    const metricas = metricasObservadas(makePosts([17, 13, 6, 0]));
    // Promedio 9 reacciones ÷ 10% que reacciona ⇒ ~90 personas lo vieron.
    expect(metricas.reaccionesPromedio).toBe(9);
    expect(estimarExpuestos({ metricas, red: 406 })).toMatchObject({ expuestos: 90, supuesto: 'despejado' });
  });

  it('no puede exponer más gente de la que hay en la red', () => {
    const metricas = metricasObservadas(makePosts([17, 13, 6, 0]));
    expect(estimarExpuestos({ metricas, red: 20 }).expuestos).toBe(20);
  });

  it('sin métricas no inventa un número: expone la red entera y lo declara', () => {
    const estimacion = estimarExpuestos({ metricas: metricasObservadas([]), red: 50 });
    expect(estimacion).toMatchObject({ expuestos: 50, supuesto: 'sin-ancla' });
    expect(estimacion.fuente).toMatch(/sin ancla/);
  });
});

describe('exponerPrimerSalto', () => {
  it('le muestra el post a una fracción de la red, no a toda', () => {
    const resultado = exponerPrimerSalto({
      candidates: makeCandidates(406, { activos: 40 }),
      posts: makePosts([17, 13, 6, 0]),
      seed: 'test',
    });

    expect(resultado.expuestos).toHaveLength(90);
    expect(resultado.noExpuestos).toHaveLength(316);
    expect(resultado.supuesto).toBe('despejado');
  });

  it('deja afuera al segundo grado: no ve el post por sí solo', () => {
    const candidates = [
      ...makeCandidates(10, { activos: 10, grado: 1 }),
      ...makeCandidates(10, { grado: 2 }).map((c) => ({ ...c, id: `g2-${c.id}` })),
    ];

    const resultado = exponerPrimerSalto({ candidates, posts: makePosts([5, 5]), seed: 'test' });

    expect(resultado.redPrimerGrado).toBe(10);
    expect(resultado.redSegundoGrado).toBe(10);
    expect(resultado.expuestos.every((c) => c.grado === 1)).toBe(true);
    expect(resultado.reservaSegundoGrado.every((c) => c.grado === 2)).toBe(true);
  });

  it('sesga la exposición hacia quien ya te viene leyendo', () => {
    const resultado = exponerPrimerSalto({
      candidates: makeCandidates(100, { activos: 10 }),
      posts: makePosts([2, 2]),
      seed: 'test',
    });

    // Los diez que interactuaron son el 10% de la red; con la exposición
    // sesgada tienen que estar sobrerrepresentados entre los expuestos.
    const activosExpuestos = resultado.expuestos.filter((c) => c.interacciones > 0).length;
    expect(activosExpuestos / resultado.expuestos.length).toBeGreaterThan(0.1);
  });

  it('el límite del llamador manda sobre la estimación y queda marcado', () => {
    const resultado = exponerPrimerSalto({
      candidates: makeCandidates(406, { activos: 40 }),
      posts: makePosts([17, 13, 6, 0]),
      seed: 'test',
      limite: 12,
    });

    expect(resultado.expuestos).toHaveLength(12);
    expect(resultado.recortadoPorLimite).toBe(true);
    expect(resultado.expuestosEstimados).toBe(90);
  });

  it('la misma semilla expone a la misma gente', () => {
    const args = { candidates: makeCandidates(100, { activos: 10 }), posts: makePosts([3, 3]), seed: 'fija' };
    const a = exponerPrimerSalto(args).expuestos.map((c) => c.id);
    const b = exponerPrimerSalto(args).expuestos.map((c) => c.id);
    expect(a).toEqual(b);
  });
});

describe('exponerSegundoSalto', () => {
  const reserva = makeCandidates(50, { grado: 2 });

  it('sin compartidos el segundo grado no ve nada', () => {
    expect(exponerSegundoSalto({ compartidores: [], reserva })).toMatchObject({
      expuestos: [],
      alcanceEstimado: 0,
      supuesto: 'sin-compartidos',
    });
  });

  it('cada compartido expone una fracción chica de la red de quien comparte', () => {
    const resultado = exponerSegundoSalto({
      compartidores: [{ nombre: 'Ana', perfil: { conexiones: 500 } }],
      reserva,
    });

    // 500 conexiones × 2% = 10. Un repost no es un megáfono.
    expect(resultado.alcanceEstimado).toBe(10);
    expect(resultado.expuestos).toHaveLength(10);
    expect(resultado.porCompartidor[0]).toMatchObject({ nombre: 'Ana', red: 500, redDeclarada: true });
  });

  it('nunca juzga a más gente de la que tiene cargada, aunque el alcance sea mayor', () => {
    const resultado = exponerSegundoSalto({
      compartidores: [{ nombre: 'Ana', perfil: { conexiones: 20000 } }],
      reserva: makeCandidates(5, { grado: 2 }),
    });

    expect(resultado.alcanceEstimado).toBe(400);
    expect(resultado.expuestos).toHaveLength(5);
  });

  it('a quien no declara su red se le supone una y se marca', () => {
    const resultado = exponerSegundoSalto({
      compartidores: [{ nombre: 'Sin datos', perfil: {} }],
      reserva,
    });

    expect(resultado.porCompartidor[0]).toMatchObject({ redDeclarada: false, red: 500 });
  });
});
