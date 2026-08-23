const { evaluateCopy, agruparObjeciones, medirDeliberacion, bandaDe, copySugeridoDe } = require('../panel.service');

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
  /**
   * El bug que hacía parecer perfecta a la calibración: pegar un post propio
   * devolvía sus reacciones reales porque cada agente las leía en su ficha.
   */
  it('rebobina la historia cuando el copy ya se publicó, y no le muestra ese post a nadie', async () => {
    const publicado =
      'Llevamos ocho meses cobrando por uso y la retención subió catorce puntos. Nadie nos avisó que el ' +
      'churn no era un problema de producto sino de cómo estábamos facturando.';
    const posts = [
      { id: 'p1', texto: 'Publicación anterior, larga como para no confundirse con ninguna otra ni quedar por debajo del umbral de solape.', ordenCronologico: 1 },
      { id: 'p2', texto: publicado, ordenCronologico: 2, totalReacciones: 31 },
    ];
    const candidates = makeCandidates(6).map((c) => ({
      ...c,
      historialObservado: [
        { tipo: 'like', postId: 'p2', orden: 2, hook: publicado.slice(0, 140) },
      ],
    }));

    const fichas = [];
    const llm = fakeLlm({ onJudge: ({ persona }) => fichas.push(persona.ficha) });
    const resultado = await evaluateCopy({
      copy: publicado, candidates, posts, panelSize: 3, rondas: 1, iteraciones: 1, llm,
    });

    expect(resultado.historia.recortada).toBe(true);
    expect(resultado.historia.reaccionesReales).toBe(31);
    expect(fichas).not.toHaveLength(0);
    for (const ficha of fichas) expect(ficha).not.toContain(publicado.slice(0, 60));
  });

  it('no toca la historia cuando el copy es nuevo', async () => {
    const posts = [{ id: 'p1', texto: 'Publicación anterior cualquiera.', ordenCronologico: 1 }];
    const resultado = await evaluateCopy({
      copy, candidates: makeCandidates(6), posts, panelSize: 3, rondas: 1, iteraciones: 1, llm: fakeLlm(),
    });
    expect(resultado.historia).toBeNull();
  });

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
    // El score va por estrato y no por orden de llamada: desde que hay puerta de
    // exposición, a quién le toca opinar primero lo decide el feed y no el índice.
    const llm = fakeLlm({
      onJudge: () => {},
      scores: [0],
    });
    llm.judgeCopy.mockImplementation(async ({ persona, ronda }) => ({
      prompt: `prompt de ${persona.nombre}`,
      ronda,
      score: persona.estrato === 'nucleo' ? 90 : 20,
      accion: 'like',
      razon: 'porque sí',
    }));

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


  it('con métricas de tus posts le muestra el copy a una fracción de la red, no a toda', async () => {
    const posts = [17, 13, 6, 0].map((totalReacciones, i) => ({
      id: String(i + 1),
      texto: `Publicación ${i + 1}`,
      fecha: `2026-0${i + 1}-01`,
      ordenCronologico: i + 1,
      totalReacciones,
      interaccionesSociales: 2,
      compartidos: 0,
      impresiones: null,
    }));

    const resultado = await evaluateCopy({
      copy,
      candidates: makeCandidates(400, { activos: 40 }),
      posts,
      rondas: 1,
      iteraciones: 1,
      llm: fakeLlm({ acciones: ['like'] }),
    });

    // 9 reacciones de promedio ⇒ ~90 lo verían, no los 400 de la red. Se juzga
    // al panel de 12 y ese resultado se escala a los 90, que es proyectar
    // dentro de la misma población y no de un panel a una red que no se le parece.
    expect(resultado.embudo.vieron).toMatchObject({ cantidad: 12, estimadoSinRecorte: 90, recortadoPorLimite: true });
    expect(resultado.embudo.proyectado).toMatchObject({ vieron: 90, reaccionaron: 90, like: 90 });
    expect(resultado.embudo.anclaObservada.veredicto).toMatch(/tus posts promedian 9 reacciones/);
  });

  it('cuando el panel cubre a todos los expuestos no proyecta nada', async () => {
    const posts = [{
      id: '1',
      texto: 'Publicación',
      fecha: '2026-01-01',
      ordenCronologico: 1,
      totalReacciones: 1,
      interaccionesSociales: 0,
      compartidos: 0,
      impresiones: null,
    }];

    const resultado = await evaluateCopy({
      copy,
      candidates: makeCandidates(8, { activos: 8 }),
      posts,
      panelSize: 8,
      rondas: 1,
      iteraciones: 1,
      llm: fakeLlm({ acciones: ['like'] }),
    });

    // 1 reacción de promedio ⇒ ~10 verían, pero la red tiene 8: se expone a todos.
    expect(resultado.embudo.vieron).toMatchObject({ cantidad: 8, recortadoPorLimite: false });
    expect(resultado.embudo.proyectado).toBeNull();
  });

  it('el segundo grado no reacciona si nadie compartió', async () => {
    const candidates = [
      ...makeCandidates(6, { activos: 6 }),
      ...makeCandidates(6).map((c) => ({ ...c, id: `g2-${c.id}`, grado: 2, interacciones: 0 })),
    ];

    const resultado = await evaluateCopy({
      copy,
      candidates,
      panelSize: 6,
      rondas: 1,
      iteraciones: 1,
      llm: fakeLlm({ acciones: ['like'] }),
    });

    expect(resultado.embudo.red.segundoGrado).toBe(6);
    expect(resultado.embudo.segundoGrado).toMatchObject({ juzgados: 0, reaccionaron: 0 });
    expect(resultado.embudo.segundoGrado.comoLeerlo).toMatch(/Nadie del panel compartió/);
    expect(resultado.segundoGrado).toEqual([]);
  });

  it('el segundo grado solo entra por la puerta de un compartido', async () => {
    const candidates = [
      ...makeCandidates(4, { activos: 4 }).map((c) => ({ ...c, perfil: { ...c.perfil, conexiones: 500 } })),
      ...makeCandidates(30).map((c) => ({ ...c, id: `g2-${c.id}`, grado: 2, interacciones: 0 })),
    ];

    const resultado = await evaluateCopy({
      copy,
      candidates,
      panelSize: 4,
      rondas: 1,
      iteraciones: 1,
      llm: fakeLlm({ acciones: ['compartir'] }),
    });

    // Cuatro compartidos × 500 conexiones × 2% = 40 de alcance, 30 cargados.
    expect(resultado.embudo.segundoGrado.alcanceEstimado).toBe(40);
    expect(resultado.embudo.segundoGrado.juzgados).toBe(30);
    expect(resultado.segundoGrado).toHaveLength(30);
    expect(resultado.exposicion.segundoSalto.compartidores).toBe(4);
  });

  it('la mezcla que reporta el embudo es la que eligieron los agentes, con lo observado al lado', async () => {
    // El panel entero dice "comentar" y la red observada casi solo da like. Ya
    // no se corrige el resultado con esa mezcla —eso era el parche de cuando se
    // le preguntaba a toda la red— pero se pone al lado para poder desconfiar.
    const candidates = makeCandidates(20, { activos: 20 }).map((c) => ({
      ...c,
      reaccionesPorTipo: { like: 9, comentar: 1 },
    }));

    const resultado = await evaluateCopy({
      copy,
      candidates,
      panelSize: 4,
      rondas: 1,
      iteraciones: 1,
      llm: fakeLlm({ acciones: ['comentar'] }),
    });

    expect(resultado.embudo.reaccionaron).toMatchObject({ comentar: 4, like: 0, compartir: 0 });
    expect(resultado.embudo.contraste.mezclaObservada).toMatchObject({ like: 90, comentar: 10 });
    expect(resultado.embudo.contraste.nota).toMatch(/desconfiá del panel/);
  });

  it('sin reacciones observadas dice que no hay con qué contrastar', async () => {
    const resultado = await evaluateCopy({
      copy,
      candidates: makeCandidates(10, { activos: 10 }),
      panelSize: 2,
      rondas: 1,
      iteraciones: 1,
      llm: fakeLlm({ acciones: ['like'] }),
    });

    expect(resultado.embudo.contraste.mezclaObservada).toBeNull();
    expect(resultado.embudo.contraste.nota).toMatch(/no tiene reacciones observadas/);
  });

  it('cuenta una acción por persona, no una por turno', async () => {
    // Dos agentes, tres iteraciones: seis turnos. Si contara turnos diría seis
    // likes sobre una red de ocho, que es exactamente el número inflado que se
    // leía como "cuánta gente te va a dar like".
    const resultado = await evaluateCopy({
      copy,
      candidates: makeCandidates(8, { activos: 8 }),
      panelSize: 2,
      rondas: 1,
      iteraciones: 3,
      llm: fakeLlm({ acciones: ['like'] }),
    });

    expect(resultado.embudo.reaccionaron.like).toBe(2);
    expect(resultado.embudo.reaccionaron.cantidad).toBeLessThanOrEqual(resultado.embudo.vieron.cantidad);
  });

  it('el embudo arranca en cuántos vieron el post y no cuenta como ignorados a los que no lo vieron', async () => {
    // Panel de 4 sobre una red de 20: solo esos cuatro vieron el post. A los
    // otros 16 no se les preguntó, y no aparecen como "siguieron de largo".
    const llm = fakeLlm({ acciones: ['comentar', 'comentar', 'ignorar', 'ignorar'] });

    const resultado = await evaluateCopy({
      copy,
      candidates: makeCandidates(20, { activos: 4 }),
      panelSize: 4,
      rondas: 1,
      iteraciones: 1,
      llm,
    });

    expect(resultado.embudo.red).toMatchObject({ total: 20, primerGrado: 20, segundoGrado: 0 });
    expect(resultado.embudo.vieron.cantidad).toBe(4);
    expect(resultado.embudo.reaccionaron).toMatchObject({ cantidad: 2, comentar: 2, siguieronDeLargo: 2 });
    // Los nombres son solo de los cuatro que opinaron, no de la red entera.
    expect(resultado.embudo.delPanel.comentar).toHaveLength(2);
    expect(resultado.embudo.delPanel.ignorar).toHaveLength(2);
    expect(resultado.embudo.comoLeerlo).toMatch(/no se les preguntó/);
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

  it('no deja el copy sugerido vacío si alguna variante tiene texto', async () => {
    const llm = fakeLlm({
      scores: [50],
      variantes: [
        { enfoque: 'vacía', copy: '   ' },
        { enfoque: 'con texto', copy: 'variante llena' },
      ],
      scorePorCopy: { 'variante llena': 80 },
    });

    const resultado = await evaluateCopy({
      copy,
      candidates: makeCandidates(6),
      panelSize: 3,
      rondas: 1,
      iteraciones: 1,
      llm,
    });

    expect(resultado.mejoras.copySugerido).toBe('variante llena');
    expect(resultado.mejoras.prompt).toBeUndefined();
    expect(llm.judgeCopy).toHaveBeenCalledTimes(3 + 3);
  });
});

describe('copySugeridoDe', () => {
  it('cae a la primera variante con texto si la ganadora vino vacía', () => {
    expect(copySugeridoDe({ preferido: '  ', variantes: [{ copy: '' }, { copy: 'quedate con esta' }] })).toBe(
      'quedate con esta',
    );
  });

  it('devuelve null si no hay ningún copy usable', () => {
    expect(copySugeridoDe({ preferido: null, variantes: [{ copy: '   ' }] })).toBeNull();
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
    [75, 'fuerte'],
    [50, 'funciona'],
    [30, 'tibio'],
    [29, 'no conecta'],
  ])('%i es %s', (score, banda) => {
    expect(bandaDe(score)).toBe(banda);
  });
});
