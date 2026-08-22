const { evaluateCopy, agruparObjeciones, medirDeliberacion, bandaDe } = require('../panel.service');

/**
 * El LLM está mockeado siempre: lo que se testea es la mecánica del panel —
 * cuántas rondas corren, qué ve cada agente, cómo se agrega la varianza — no
 * el criterio del modelo.
 */

function makeCandidates(n, { enriquecidos = n, activos = Math.floor(n / 2) } = {}) {
  return Array.from({ length: n }, (unused, i) => ({
    id: String(i + 1),
    nombre: `Contacto ${i + 1}`,
    headline: `Headline ${i + 1}`,
    interacciones: i < activos ? 2 : 0,
    comentariosPrevios: [],
    perfil:
      i < enriquecidos
        ? {
            descripcion: `Descripción ${i + 1}`,
            cargoActual: 'Founder',
            empresaActual: `Empresa ${i + 1}`,
            experiencia: [{ cargo: 'CTO', empresa: 'Previa', desde: '2019', hasta: '2023' }],
            educacion: [{ institucion: 'Uni', titulo: 'Ing', anio: 2015 }],
            publicaciones: [{ texto: 'Hablo de series B', tipo: 'post' }],
            enComun: { instituciones: ['Uni'], conexionesMutuas: 4 },
          }
        : null,
  }));
}

/**
 * Un LLM determinista con score fijo; sirve para medir mecánica, no criterio.
 *
 * `variantes` viene vacío por defecto para que el conteo de llamadas de cada
 * test sea solo el de su panel: una variante propuesta hace que el panel la
 * vote, y esas llamadas son reales. Los tests que miden la prueba de variantes
 * las declaran, con su score en `scorePorCopy`.
 */
function fakeLlm({ scores = [70], acciones = ['comentar'], onJudge, variantes = [], scorePorCopy = {} } = {}) {
  let llamadas = 0;
  return {
    MODEL: 'modelo-de-prueba',
    llamadas: () => llamadas,
    judgeCopy: jest.fn(async ({ persona, feed, ronda, copy }) => {
      onJudge?.({ persona, feed, ronda, copy });
      if (copy in scorePorCopy) {
        // Votar una variante no consume el ciclo de scores del copy original.
        return {
          prompt: `prompt de ${persona.nombre}`,
          ronda,
          score: scorePorCopy[copy],
          accion: scorePorCopy[copy] >= 50 ? 'like' : 'ignorar',
          razon: 'lo voté',
          objecion: 'todavía es largo',
        };
      }
      const i = llamadas;
      llamadas += 1;
      return {
        prompt: `prompt de ${persona.nombre}`,
        ronda,
        score: scores[i % scores.length],
        accion: acciones[i % acciones.length],
        razon: 'porque sí',
        objecion: 'suena a promesa vacía',
        comentario: `comentario de ${persona.nombre}`,
      };
    }),
    suggestImprovements: jest.fn(async ({ evidencia }) => ({
      prompt: 'prompt de mejoras',
      diagnostico: `panel de ${evidencia.panel}`,
      mejoras: [{ cambio: 'aterrizá la promesa', porQue: 'la objetaron', evidencia: 'suena a promesa vacía' }],
      variantes,
    })),
  };
}

const copy = 'Lanzamos algo que te va a cambiar la vida, escribime.';

describe('evaluateCopy', () => {
  it('corre panel x rondas x iteraciones llamadas al modelo', async () => {
    const llm = fakeLlm();

    const resultado = await evaluateCopy({
      copy,
      candidates: makeCandidates(10),
      panelSize: 4,
      rondas: 2,
      iteraciones: 3,
      llm,
    });

    expect(llm.judgeCopy).toHaveBeenCalledTimes(4 * 2 * 3);
    expect(resultado.configuracion).toMatchObject({ panel: 4, rondas: 2, iteraciones: 3 });
    expect(resultado.cobertura).toMatchObject({ turnosEsperados: 24, turnosCompletados: 24, turnosPerdidos: 0 });
  });

  it('la primera ronda opina a ciegas y la segunda ve los comentarios de sus pares', async () => {
    const vistos = [];
    const llm = fakeLlm({ onJudge: ({ ronda, feed }) => vistos.push({ ronda, visto: feed.length }) });

    await evaluateCopy({ copy, candidates: makeCandidates(6), panelSize: 3, rondas: 2, iteraciones: 1, llm });

    expect(vistos.filter((v) => v.ronda === 1).every((v) => v.visto === 0)).toBe(true);
    // Los tres de la ronda 1 comentaron, así que la ronda 2 los ve a los tres.
    expect(vistos.filter((v) => v.ronda === 2).every((v) => v.visto === 3)).toBe(true);
  });

  it('un like no entra al feed: solo comentar y compartir son públicos', async () => {
    const vistos = [];
    const llm = fakeLlm({
      acciones: ['like'],
      onJudge: ({ ronda, feed }) => vistos.push({ ronda, visto: feed.length }),
    });

    await evaluateCopy({ copy, candidates: makeCandidates(6), panelSize: 3, rondas: 2, iteraciones: 1, llm });

    expect(vistos.every((v) => v.visto === 0)).toBe(true);
  });

  it('corta la iteración cuando la ronda no dejó comentarios que deliberar', async () => {
    const llm = fakeLlm({ acciones: ['ignorar'] });

    const resultado = await evaluateCopy({
      copy,
      candidates: makeCandidates(6),
      panelSize: 3,
      rondas: 3,
      iteraciones: 1,
      llm,
    });

    // Se corre solo la ronda 1: sin comentarios, las otras dos verían lo mismo.
    expect(llm.judgeCopy).toHaveBeenCalledTimes(3);
    expect(resultado.porIteracion[0].rondasCorridas).toBe(1);
    expect(resultado.cobertura).toMatchObject({ turnosEsperados: 9, turnosCorridos: 3, turnosCompletados: 3 });
    // El veredicto sale igual: la ronda 1 es el último estado de opinión.
    expect(resultado.score).toBe(70);
  });

  it('declara convergencia cuando las iteraciones caen en la misma banda', async () => {
    const resultado = await evaluateCopy({
      copy,
      candidates: makeCandidates(8),
      panelSize: 4,
      rondas: 1,
      iteraciones: 3,
      llm: fakeLlm({ scores: [70, 72, 68] }),
    });

    expect(resultado.convergio).toBe(true);
    expect(resultado.banda).toBe('funciona');
    expect(resultado.veredicto).toMatch(/converge/);
  });

  it('marca el caso borde cuando las corridas cruzan bandas', async () => {
    // Cuatro agentes por iteración: la primera saca 20, la segunda 90.
    const resultado = await evaluateCopy({
      copy,
      candidates: makeCandidates(8),
      panelSize: 2,
      rondas: 1,
      iteraciones: 2,
      llm: fakeLlm({ scores: [20, 20, 90, 90] }),
    });

    expect(resultado.convergio).toBe(false);
    expect(resultado.veredicto).toMatch(/caso borde/);
    expect(resultado.dispersion).toBeGreaterThan(6);
  });

  it('un turno que falla no tumba la corrida y queda contado en cobertura', async () => {
    const llm = fakeLlm();
    let fallos = 0;
    llm.judgeCopy = jest.fn(async ({ persona, ronda }) => {
      if (persona.nombre === 'Contacto 1') {
        fallos += 1;
        throw new Error('429 rate limit');
      }
      return { prompt: 'p', ronda, score: 60, accion: 'like', razon: 'ok' };
    });

    const resultado = await evaluateCopy({
      copy,
      candidates: makeCandidates(4),
      panelSize: 4,
      rondas: 1,
      iteraciones: 1,
      llm,
    });

    // Un reintento por turno: el agente que falla se intenta dos veces.
    expect(fallos).toBe(2);
    expect(resultado.cobertura.turnosPerdidos).toBe(1);
    expect(resultado.cobertura.turnosCompletados).toBe(3);
    expect(resultado.score).toBe(60);
  });

  it('devuelve el veredicto aunque la síntesis de mejoras falle', async () => {
    const llm = fakeLlm();
    llm.suggestImprovements = jest.fn(async () => {
      throw new Error('el modelo no devolvió mejoras');
    });

    const resultado = await evaluateCopy({
      copy,
      candidates: makeCandidates(4),
      panelSize: 2,
      rondas: 1,
      iteraciones: 1,
      llm,
    });

    expect(resultado.mejoras).toBeNull();
    expect(resultado.score).toBe(70);
  });

  it('falla explícito cuando la red está vacía', async () => {
    await expect(evaluateCopy({ copy, candidates: [], llm: fakeLlm() })).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('falla con 502 si ningún agente pudo evaluar', async () => {
    const llm = fakeLlm();
    llm.judgeCopy = jest.fn(async () => {
      throw new Error('sin API key');
    });

    await expect(
      evaluateCopy({ copy, candidates: makeCandidates(4), panelSize: 2, rondas: 1, iteraciones: 1, llm }),
    ).rejects.toMatchObject({ statusCode: 502 });
  });

  it('mezcla núcleo y silenciosos en el panel', async () => {
    const resultado = await evaluateCopy({
      copy,
      candidates: makeCandidates(20, { activos: 10 }),
      panelSize: 6,
      rondas: 1,
      iteraciones: 1,
      llm: fakeLlm(),
    });

    const estratos = resultado.panel.map((p) => p.estrato);
    expect(estratos.filter((e) => e === 'nucleo')).toHaveLength(3);
    expect(estratos.filter((e) => e === 'silencioso')).toHaveLength(3);
  });

  it('expone por agente qué vio e hizo en cada ronda de cada corrida', async () => {
    const resultado = await evaluateCopy({
      copy,
      candidates: makeCandidates(6),
      panelSize: 3,
      rondas: 2,
      iteraciones: 2,
      llm: fakeLlm({ acciones: ['like', 'comentar', 'ignorar'] }),
    });

    const agente = resultado.panel[0];
    expect(agente.historial).toHaveLength(4);
    expect(agente.historial[0]).toMatchObject({
      iteracion: 1,
      ronda: 1,
      vioElCopy: true,
    });
    expect(agente.historial.every((turno) => ['like', 'comentar', 'ignorar'].includes(turno.accion))).toBe(true);
    expect(agente.historial.find((turno) => turno.ronda === 2).vioComentarios.length).toBeGreaterThan(0);
  });

  it('la misma semilla elige el mismo panel', async () => {
    const correr = (semilla) =>
      evaluateCopy({
        copy,
        candidates: makeCandidates(30),
        panelSize: 5,
        rondas: 1,
        iteraciones: 1,
        seed: semilla,
        llm: fakeLlm(),
      });

    const [a, b, c] = await Promise.all([correr('x'), correr('x'), correr('y')]);

    expect(a.panel.map((p) => p.id)).toEqual(b.panel.map((p) => p.id));
    expect(a.panel.map((p) => p.id)).not.toEqual(c.panel.map((p) => p.id));
  });

  it('las mejoras se alimentan de las objeciones medidas, no del copy solo', async () => {
    const llm = fakeLlm();

    await evaluateCopy({ copy, candidates: makeCandidates(4), panelSize: 2, rondas: 1, iteraciones: 2, llm });

    const evidencia = llm.suggestImprovements.mock.calls[0][0].evidencia;
    expect(evidencia.objeciones[0]).toMatchObject({ texto: 'suena a promesa vacía', veces: 4 });
    expect(evidencia.comentarios.length).toBeGreaterThan(0);
  });

  it('el reescritor recibe a quiénes les escribe y qué del original sí funcionó', async () => {
    const llm = fakeLlm({ scores: [85] });

    await evaluateCopy({ copy, candidates: makeCandidates(4), panelSize: 2, rondas: 1, iteraciones: 1, llm });

    const { evidencia } = llm.suggestImprovements.mock.calls[0][0];
    expect(evidencia.audiencia).toHaveLength(2);
    expect(evidencia.audiencia[0]).toHaveProperty('headline');
    expect(evidencia.loQueFunciono.length).toBeGreaterThan(0);
  });

  it('separa el score de quienes ya te leen del de los que nunca reaccionaron', async () => {
    // Los tres primeros candidatos tienen interacciones; los tres últimos no.
    const llm = fakeLlm({ scores: [90, 90, 90, 20, 20, 20] });

    const resultado = await evaluateCopy({
      copy,
      candidates: makeCandidates(6, { activos: 3 }),
      panelSize: 6,
      rondas: 1,
      iteraciones: 1,
      llm,
    });

    expect(resultado.porEstrato.nucleo).toMatchObject({ agentes: 3, score: 90, banda: 'fuerte' });
    expect(resultado.porEstrato.silencioso).toMatchObject({ agentes: 3, score: 20, banda: 'no conecta' });
    // El promedio solo habría dicho 55: un copy tibio que en realidad polariza.
    expect(resultado.score).toBe(55);
  });

  it('proyecta cada estrato por su tasa y nombra solo a quienes juzgó', async () => {
    // Panel de 4 sobre una red de 20: 4 con interacciones, 16 silenciosos.
    // Los dos del núcleo comentan, los dos silenciosos ignoran.
    const llm = fakeLlm({ acciones: ['comentar', 'comentar', 'ignorar', 'ignorar'] });

    const resultado = await evaluateCopy({
      copy,
      candidates: makeCandidates(20, { activos: 4 }),
      panelSize: 4,
      rondas: 1,
      iteraciones: 1,
      llm,
    });

    // Núcleo comenta 100% → 4 de 4. Silenciosos 0% → 0 de 16. Nunca 20.
    expect(resultado.proyeccion.estimado.comentar).toBe(4);
    expect(resultado.proyeccion).toMatchObject({ totalRed: 20, juzgados: 4 });
    expect(resultado.proyeccion.totalesPorEstrato).toEqual({ nucleo: 4, silencioso: 16 });
    // Los nombres son solo de los cuatro que opinaron, no de la red entera.
    expect(resultado.proyeccion.delPanel.comentar).toHaveLength(2);
    expect(resultado.proyeccion.delPanel.ignorar).toHaveLength(2);
  });

  it('marca qué comentarios se publicarían y cuáles son solo lo que dirían', async () => {
    const llm = fakeLlm({ acciones: ['comentar', 'ignorar'] });

    const resultado = await evaluateCopy({
      copy,
      candidates: makeCandidates(4),
      panelSize: 2,
      rondas: 1,
      iteraciones: 1,
      llm,
    });

    // Los dos escriben qué dirían; solo el que comenta lo publicaría.
    expect(resultado.comentarios).toHaveLength(2);
    expect(resultado.comentarios.filter((c) => c.publicado)).toHaveLength(1);
  });

  it('reintenta la síntesis y explica por qué no hay copy si igual falla', async () => {
    const llm = fakeLlm();
    let intentos = 0;
    llm.suggestImprovements = jest.fn(async () => {
      intentos += 1;
      throw new Error('529 overloaded');
    });

    const resultado = await evaluateCopy({
      copy,
      candidates: makeCandidates(4),
      panelSize: 2,
      rondas: 1,
      iteraciones: 1,
      llm,
    });

    expect(intentos).toBe(2);
    expect(resultado.mejoras).toBeNull();
    expect(resultado.mejorasError).toMatch(/529 overloaded/);
  });

  it('recomienda la variante que el mismo panel puntuó más alto, no la primera', async () => {
    const llm = fakeLlm({
      scores: [50],
      variantes: [
        { enfoque: 'arranca por el dato', copy: 'variante A' },
        { enfoque: 'arranca por la escena', copy: 'variante B' },
      ],
      scorePorCopy: { 'variante A': 60, 'variante B': 80 },
    });

    const resultado = await evaluateCopy({
      copy,
      candidates: makeCandidates(6),
      panelSize: 3,
      rondas: 1,
      iteraciones: 1,
      llm,
    });

    expect(resultado.mejoras.copySugerido).toBe('variante B');
    expect(resultado.mejoras.prueba).toMatchObject({ baseline: 50, score: 80, delta: 30, gano: true });
    expect(resultado.mejoras.variantes.find((v) => v.recomendada).enfoque).toBe('arranca por la escena');
    // Cada variante la votó el panel entero: 3 del original + 3 por variante.
    expect(llm.judgeCopy).toHaveBeenCalledTimes(3 + 3 + 3);
  });

  it('dice que ninguna variante ganó en vez de venderla como mejora', async () => {
    const llm = fakeLlm({
      scores: [70],
      variantes: [{ enfoque: 'más corta', copy: 'variante tibia' }],
      scorePorCopy: { 'variante tibia': 71 },
    });

    const resultado = await evaluateCopy({
      copy,
      candidates: makeCandidates(6),
      panelSize: 3,
      rondas: 1,
      iteraciones: 1,
      llm,
    });

    expect(resultado.mejoras.prueba.gano).toBe(false);
    expect(resultado.mejoras.prueba.veredicto).toMatch(/Ninguna variante/);
    // Se devuelve igual: es la mejor medida, con su número a la vista.
    expect(resultado.mejoras.copySugerido).toBe('variante tibia');
  });
});

describe('agruparObjeciones', () => {
  it('cuenta la misma objeción escrita distinto como una sola', () => {
    const objeciones = agruparObjeciones([
      { objecion: 'Suena  a promesa vacía', nombre: 'A' },
      { objecion: 'suena a promesa vacía', nombre: 'B' },
      { objecion: 'no es para mi rubro', nombre: 'C' },
      { objecion: null, nombre: 'D' },
    ]);

    expect(objeciones).toHaveLength(2);
    expect(objeciones[0]).toMatchObject({ veces: 2 });
  });
});

describe('medirDeliberacion', () => {
  it('cuenta como cambio de opinión un cambio de acción o un salto de score', () => {
    const turnos = [
      { iteracion: 1, ronda: 1, conexionId: '1', accion: 'ignorar', score: 30 },
      { iteracion: 1, ronda: 1, conexionId: '2', accion: 'like', score: 60 },
      { iteracion: 1, ronda: 2, conexionId: '1', accion: 'like', score: 55 },
      { iteracion: 1, ronda: 2, conexionId: '2', accion: 'like', score: 62 },
    ];

    const deliberacion = medirDeliberacion({ turnos, rondas: 2 });

    expect(deliberacion.cambiosDeOpinion).toBe(1);
    expect(deliberacion.scoreRonda1).toBe(45);
    expect(deliberacion.scoreRondaFinal).toBe(58.5);
    expect(deliberacion.delta).toBe(13.5);
  });
});

describe('bandaDe', () => {
  it.each([
    [90, 'fuerte'],
    [65, 'funciona'],
    [40, 'tibio'],
    [10, 'no conecta'],
  ])('%i es %s', (score, banda) => {
    expect(bandaDe(score)).toBe(banda);
  });
});
