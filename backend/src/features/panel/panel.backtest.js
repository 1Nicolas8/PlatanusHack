const AppError = require('../../shared/errors/AppError');
const { evaluateCopy } = require('./panel.service');

/**
 * Correr la simulación contra un post que ya se publicó, y comparar.
 *
 * Es la única forma de contestar "¿qué tan lejos de la realidad está esto?" con
 * un número en vez de con una sensación. La red, las publicaciones anteriores y
 * las reacciones observadas ya están cargadas: alcanza con rebobinar hasta el
 * día anterior a ese post, correr el motor y mirar contra lo que efectivamente
 * pasó.
 *
 * Lo que hace o rompe el ejercicio es el recorte de la historia. Si a un agente
 * se le muestra en su ficha que le dio like a ESTE post, va a contestar que sí:
 * no se estaría midiendo la simulación, se estaría midiendo si el modelo sabe
 * leer. Por eso todo lo que pasó desde el post evaluado en adelante se saca de
 * las fichas antes de construir a nadie.
 */

/** El más reciente con métrica, que es el que más sirve para comparar. */
function elegirPost({ posts, orden }) {
  if (orden !== undefined && orden !== null) {
    const elegido = posts.find((p) => p.ordenCronologico === orden);
    if (!elegido) throw AppError.notFound(`Este perfil no tiene una publicación en la posición ${orden}.`);
    return elegido;
  }

  const conMetrica = posts.filter((p) => typeof p.totalReacciones === 'number');
  if (conMetrica.length === 0) {
    throw AppError.conflict(
      'Ninguna publicación de este perfil tiene métricas cargadas: sin reacciones reales no hay ' +
        'contra qué comparar la simulación.',
    );
  }
  return conMetrica[conMetrica.length - 1];
}

/**
 * El mundo tal como estaba justo antes de ese post.
 *
 * @returns {{ candidates, posts, reales }} `reales` son los ids de quienes de
 *   verdad reaccionaron al post evaluado, que es contra lo que se compara.
 */
function rebobinar({ candidates, posts, objetivo }) {
  const corte = objetivo.ordenCronologico;
  const anteriores = posts.filter((p) => (p.ordenCronologico ?? 0) < corte);

  const reales = new Set();
  const recortados = candidates.map((candidate) => {
    const eventos = candidate.historialObservado ?? [];
    if (eventos.some((e) => String(e.postId) === String(objetivo.id))) reales.add(String(candidate.id));

    // Un evento sin orden no se puede fechar contra el corte. Se descarta: dejar
    // pasar uno posterior contaminaría la ficha, y es exactamente lo que este
    // recorte existe para evitar.
    const previos = eventos.filter((e) => Number.isFinite(e.orden) && e.orden < corte);
    const porTipo = {};
    for (const evento of previos) porTipo[evento.tipo] = (porTipo[evento.tipo] ?? 0) + 1;

    return {
      ...candidate,
      interacciones: previos.length,
      reaccionesPorTipo: porTipo,
      comentariosPrevios: previos.map((e) => e.comentario).filter(Boolean),
      historialObservado: previos,
    };
  });

  return { candidates: recortados, posts: anteriores, reales };
}

const brecha = (predicho, real) => {
  if (real === null || real === undefined) return null;
  return { predicho, real, diferencia: predicho - real, razon: real === 0 ? null : Number((predicho / real).toFixed(2)) };
};

/**
 * Corre el backtest y devuelve la comparación.
 *
 * @param {object}   params
 * @param {object[]} params.candidates
 * @param {object[]} params.posts
 * @param {number}   [params.orden]  qué publicación evaluar; por defecto la última con métrica
 */
async function backtestPost({ candidates, posts, orden, panelSize, semilla, icp, llm } = {}) {
  if (!posts?.length) {
    throw AppError.conflict('Este perfil no tiene publicaciones cargadas: no hay nada contra qué contrastar.');
  }

  const objetivo = elegirPost({ posts, orden });
  const mundo = rebobinar({ candidates, posts, objetivo });

  if (mundo.posts.length === 0) {
    throw AppError.conflict(
      `La publicación ${objetivo.ordenCronologico} es la primera del perfil: antes de ella no hay historia ` +
        'con la que armar a los agentes, así que el backtest no mediría nada.',
    );
  }

  const resultado = await evaluateCopy({
    copy: objetivo.texto,
    candidates: mundo.candidates,
    posts: mundo.posts,
    icp,
    panelSize,
    // Una sola ronda y una sola pasada: lo que se mide es cuánta gente
    // reacciona, no si el veredicto converge. Las otras dos dimensiones
    // multiplicarían el costo sin mover el número que se está comparando.
    rondas: 1,
    iteraciones: 1,
    seed: semilla ?? `backtest:${objetivo.id}`,
    llm,
  });

  const { embudo } = resultado;
  const predicho = embudo.proyectado ?? {
    reaccionaron: embudo.reaccionaron.cantidad,
    like: embudo.reaccionaron.like,
    comentar: embudo.reaccionaron.comentar,
    compartir: embudo.reaccionaron.compartir,
  };

  const nombresPredichos = new Set(
    [...embudo.delPanel.like, ...embudo.delPanel.comentar, ...embudo.delPanel.compartir].map((p) => p.nombre),
  );
  const nombresReales = new Set(
    mundo.candidates.filter((c) => mundo.reales.has(String(c.id))).map((c) => c.nombre),
  );
  const aciertos = [...nombresPredichos].filter((n) => nombresReales.has(n));

  const reacciones = brecha(predicho.reaccionaron, objetivo.totalReacciones);
  const comentarios = brecha(predicho.comentar, objetivo.interaccionesSociales);
  const compartidos = brecha(predicho.compartir, objetivo.compartidos);

  return {
    post: {
      orden: objetivo.ordenCronologico,
      fecha: objetivo.fecha,
      texto: objetivo.texto,
      reaccionesReales: objetivo.totalReacciones,
      comentariosReales: objetivo.interaccionesSociales,
      compartidosReales: objetivo.compartidos,
    },
    historia: {
      postsAnteriores: mundo.posts.length,
      reaccionesEnLaVentana: mundo.candidates.reduce((total, c) => total + c.interacciones, 0),
      nota:
        `Los agentes se armaron solo con lo que había pasado hasta la publicación ${objetivo.ordenCronologico}. ` +
        'Ni ese post ni los posteriores aparecen en ninguna ficha: si un agente leyera que ya le dio like a ' +
        'esto, el backtest no mediría la simulación, mediría si el modelo sabe leer.',
    },
    brechas: { reacciones, comentarios, compartidos },
    nombres: {
      predichos: nombresPredichos.size,
      reales: nombresReales.size,
      aciertos: aciertos.length,
      quienes: aciertos,
      // Con panel recortado no se le preguntó a toda la gente que vería el post,
      // así que un falso negativo puede ser alguien a quien nunca se consultó.
      parcial: Boolean(embudo.proyectado),
      nota: embudo.proyectado
        ? `Se juzgó a ${embudo.vieron.cantidad} de las ~${embudo.vieron.estimadoSinRecorte} personas que ` +
          'verían el post: los nombres que faltan pueden ser gente a la que no se le preguntó, no un error.'
        : 'Se juzgó a todos los que verían el post, así que los nombres se pueden comparar de frente.',
    },
    veredicto: veredictoDe({ reacciones, comentarios }),
    embudo,
    exposicion: resultado.exposicion,
    score: resultado.score,
    banda: resultado.banda,
  };
}

function veredictoDe({ reacciones, comentarios }) {
  if (!reacciones) {
    return 'La publicación evaluada no tiene reacciones reales cargadas: no hay contra qué comparar.';
  }
  const { predicho, real, razon } = reacciones;
  const base = `La simulación predijo ${predicho} reacciones y el post juntó ${real}` +
    (comentarios ? `, y predijo ${comentarios.predicho} comentarios contra ${comentarios.real} reales` : '') +
    '.';

  if (razon === null) return `${base} El post real no tuvo ninguna reacción, así que la razón no se puede calcular.`;
  if (razon >= 0.7 && razon <= 1.4) return `${base} Quedó dentro del rango: la simulación acierta el orden de magnitud.`;
  if (razon > 1.4) return `${base} La simulación infla: revisá el supuesto de cuánta gente ve tus posts.`;
  return `${base} La simulación se queda corta: o expone a menos gente de la que ve el post, o los agentes son más duros que las personas.`;
}

module.exports = { backtestPost, rebobinar, elegirPost };
