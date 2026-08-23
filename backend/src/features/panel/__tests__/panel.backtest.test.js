const { backtestPost, rebobinar, elegirPost } = require('../panel.backtest');

function makePosts() {
  return [17, 13, 6, 9].map((totalReacciones, i) => ({
    id: String(i + 1),
    texto: `Publicación número ${i + 1} sobre cómo armamos el equipo`,
    fecha: `2026-0${i + 1}-01`,
    ordenCronologico: i + 1,
    impresiones: null,
    totalReacciones,
    compartidos: 0,
    interaccionesSociales: 2,
  }));
}

/** Cinco contactos; los dos primeros reaccionaron también al post evaluado. */
function makeCandidates() {
  return Array.from({ length: 5 }, (unused, i) => ({
    id: String(i + 1),
    nombre: `Contacto ${i + 1}`,
    headline: 'Founder',
    fechaContacto: null,
    grado: 1,
    interacciones: i < 2 ? 2 : 1,
    reaccionesPorTipo: i < 2 ? { like: 2 } : { like: 1 },
    comentariosPrevios: [],
    historialObservado:
      i < 2
        ? [
          { tipo: 'like', subtipo: 'like', postId: '1', orden: 1, fecha: '2026-01-01', hook: 'Publicación número 1' },
          { tipo: 'like', subtipo: 'like', postId: '4', orden: 4, fecha: '2026-04-01', hook: 'Publicación número 4' },
        ]
        : [{ tipo: 'like', subtipo: 'like', postId: '1', orden: 1, fecha: '2026-01-01', hook: 'Publicación número 1' }],
    perfil: { cargoActual: 'Founder', conexiones: 500 },
  }));
}

function fakeLlm({ accion = 'like' } = {}) {
  return {
    MODEL: 'modelo-de-prueba',
    judgeCopy: jest.fn(async ({ persona, ronda }) => ({
      prompt: persona.ficha,
      ronda,
      score: 70,
      accion,
      razon: 'me habla',
    })),
    suggestImprovements: jest.fn(async () => ({
      prompt: 'mejoras',
      diagnostico: 'ok',
      mejoras: [{ cambio: 'x', porQue: 'y', evidencia: 'z' }],
      variantes: [],
    })),
  };
}

describe('elegirPost', () => {
  it('sin orden toma la última con métricas', () => {
    expect(elegirPost({ posts: makePosts() }).ordenCronologico).toBe(4);
  });

  it('un orden que no existe es un 404, no un post al azar', () => {
    expect(() => elegirPost({ posts: makePosts(), orden: 99 })).toThrow(/posición 99/);
  });
});

describe('rebobinar', () => {
  it('saca de las fichas el post evaluado y todo lo posterior', () => {
    const posts = makePosts();
    const { candidates, posts: anteriores, reales } = rebobinar({
      candidates: makeCandidates(),
      posts,
      objetivo: posts[3],
    });

    expect(anteriores).toHaveLength(3);
    // Los dos primeros reaccionaron al post 4: eso es lo que hay que adivinar.
    expect([...reales]).toEqual(['1', '2']);
    for (const candidate of candidates) {
      expect(candidate.historialObservado.every((e) => e.orden < 4)).toBe(true);
    }
    expect(candidates[0].interacciones).toBe(1);
    expect(candidates[0].reaccionesPorTipo).toEqual({ like: 1 });
  });
});

describe('backtestPost', () => {
  it('ninguna ficha menciona el post evaluado: sin eso no mediría nada', async () => {
    const llm = fakeLlm();
    const posts = makePosts();

    await backtestPost({ candidates: makeCandidates(), posts, orden: 4, panelSize: 5, llm });

    const fichas = llm.judgeCopy.mock.calls.map(([{ persona }]) => persona.ficha);
    expect(fichas.length).toBeGreaterThan(0);
    for (const ficha of fichas) {
      expect(ficha).not.toMatch(/Publicación número 4/);
    }
  });

  it('compara lo predicho contra lo que el post juntó de verdad', async () => {
    const resultado = await backtestPost({
      candidates: makeCandidates(),
      posts: makePosts(),
      orden: 4,
      panelSize: 5,
      llm: fakeLlm(),
    });

    expect(resultado.post).toMatchObject({ orden: 4, reaccionesReales: 9, comentariosReales: 2 });
    expect(resultado.brechas.reacciones).toMatchObject({ real: 9 });
    expect(resultado.brechas.reacciones.diferencia).toBe(resultado.brechas.reacciones.predicho - 9);
    expect(resultado.veredicto).toMatch(/La simulación predijo/);
  });

  it('dice a quiénes acertó', async () => {
    const resultado = await backtestPost({
      candidates: makeCandidates(),
      posts: makePosts(),
      orden: 4,
      panelSize: 5,
      llm: fakeLlm({ accion: 'like' }),
    });

    // Todos likean, así que los dos que reaccionaron de verdad están entre los predichos.
    expect(resultado.nombres.reales).toBe(2);
    expect(resultado.nombres.aciertos).toBe(2);
    expect(resultado.nombres.quienes).toEqual(['Contacto 1', 'Contacto 2']);
  });

  it('no evalúa el primer post: antes de él no hay historia con la que armar a nadie', async () => {
    await expect(
      backtestPost({ candidates: makeCandidates(), posts: makePosts(), orden: 1, llm: fakeLlm() }),
    ).rejects.toThrow(/es la primera del perfil/);
  });

  it('sin publicaciones no hay nada contra qué contrastar', async () => {
    await expect(backtestPost({ candidates: makeCandidates(), posts: [], llm: fakeLlm() }))
      .rejects.toThrow(/no tiene publicaciones cargadas/);
  });
});
