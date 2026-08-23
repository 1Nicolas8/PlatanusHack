const AppError = require('../../shared/errors/AppError');

/**
 * Recortar la historia de la red a un momento anterior a un post.
 *
 * Vive acá y no dentro del backtest porque hacen falta dos cosas distintas con
 * el mismo recorte: contrastar la simulación contra un post publicado, y evitar
 * que evaluar un copy YA publicado se le filtre a los agentes en la ficha.
 *
 * El segundo caso es el que se descubrió tarde. Alguien pega el texto de un
 * post suyo para ver qué opina el panel, y cada agente lee en su propia ficha
 * «el 3 de febrero celebraste "<las primeras 140 letras de ese mismo copy>"».
 * No está juzgando el copy: está copiando la respuesta. El panel devolvía las
 * reacciones reales del post y eso se leía como una calibración perfecta.
 */

/** Dos textos son el mismo post aunque cambien saltos de línea o mayúsculas. */
const normalizar = (texto) =>
  String(texto ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Cuánto texto tiene que compartir un copy con un post para considerarlo el
 * mismo. Por debajo de esto dos publicaciones sobre el mismo tema se
 * confundirían, y recortar de más le borra al agente historia que sí debería
 * leer.
 */
const MIN_SOLAPE = 120;

/**
 * ¿Este copy es una publicación que el perfil ya hizo?
 *
 * Acepta el texto recortado —la ficha guarda 140 caracteres del gancho y el
 * scraper trunca los posts largos— así que alcanza con que uno contenga al otro.
 *
 * @returns {object|null} el post publicado, o null si el copy es nuevo
 */
function postYaPublicado({ copy, posts = [] }) {
  const texto = normalizar(copy);
  if (texto.length < MIN_SOLAPE) return null;

  return (
    posts.find((post) => {
      const suyo = normalizar(post?.texto);
      if (suyo.length < MIN_SOLAPE) return false;
      return suyo === texto || suyo.includes(texto) || texto.includes(suyo);
    }) ?? null
  );
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

/**
 * Deja el mundo listo para evaluar un copy, sea nuevo o ya publicado.
 *
 * Cuando el copy es una publicación existente devuelve la red rebobinada al día
 * anterior y lo dice con todas las letras: un número que se puede contrastar
 * contra lo que pasó de verdad se lee distinto de uno que predice el futuro.
 */
function prepararMundo({ copy, candidates, posts = [] }) {
  const publicado = postYaPublicado({ copy, posts });
  if (!publicado) return { candidates, posts, historia: null };

  const mundo = rebobinar({ candidates, posts, objetivo: publicado });
  if (mundo.posts.length === 0) {
    throw AppError.conflict(
      'Este copy es la primera publicación del perfil. Para que los agentes no lo lean como algo que ya ' +
        'vieron habría que borrarles toda la historia, y sin historia no hay panel que valga: probá con ' +
        'un copy nuevo.',
    );
  }

  return {
    ...mundo,
    historia: {
      recortada: true,
      postOrden: publicado.ordenCronologico ?? null,
      postFecha: publicado.fecha ?? null,
      reaccionesReales: publicado.totalReacciones ?? null,
      comentariosReales: publicado.interaccionesSociales ?? null,
      compartidosReales: publicado.compartidos ?? null,
      yaReaccionaron: mundo.reales.size,
      nota:
        'Este copy ya está publicado en el perfil, así que los agentes se armaron con la historia anterior ' +
        'a esa publicación: ni ella ni las posteriores aparecen en ninguna ficha. Sin este recorte cada ' +
        'agente leería que ya le dio like a este mismo texto y te devolvería las reacciones reales del ' +
        'post, no una simulación.',
    },
  };
}

module.exports = { postYaPublicado, rebobinar, prepararMundo, normalizar, MIN_SOLAPE };
