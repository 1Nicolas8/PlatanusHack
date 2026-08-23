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

/**
 * Reduce un texto a lo comparable: solo letras y números, en minúscula.
 *
 * Comparar los textos crudos no sirve. El scraper corta el post donde LinkedIn
 * pone el "ver más" y le deja puntos suspensivos; el usuario pega la versión
 * completa, con los emojis y las comillas curvas que el editor le puso. Son el
 * mismo post y no comparten ni una subcadena larga.
 */
const canonizar = (texto) =>
  String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Cuántos caracteres canónicos comparten desde el arranque.
 *
 * El prefijo es lo que aguanta el truncado: lo que el scraper guardó ES el
 * principio de lo que el usuario pega. Todo lo que se rompe al final —los
 * puntos suspensivos, los hashtags, la firma— deja de importar.
 */
function prefijoComun(a, b) {
  const tope = Math.min(a.length, b.length);
  let i = 0;
  while (i < tope && a[i] === b[i]) i += 1;
  return i;
}

/** Cuánto prefijo alcanza para decir "es el mismo post". Unas quince palabras. */
const MIN_PREFIJO = 90;

/**
 * Cuánto se solapan dos textos por palabras, sin importar el orden.
 *
 * Es el segundo camino, para cuando el copy pegado tiene una edición en el
 * medio y el prefijo se corta antes de tiempo. Un post editado sigue siendo el
 * mismo post a los ojos de quien ya lo vio pasar por su feed.
 */
function solapePalabras(a, b) {
  const setA = new Set(a.split(' ').filter(Boolean));
  const setB = new Set(b.split(' ').filter(Boolean));
  if (setA.size < MIN_PALABRAS || setB.size < MIN_PALABRAS) return 0;
  let comunes = 0;
  for (const palabra of setA) if (setB.has(palabra)) comunes += 1;
  return comunes / Math.min(setA.size, setB.size);
}

/** Textos más cortos que esto no se comparan por palabras: dan falsos positivos. */
const MIN_PALABRAS = 20;
/** Con este solape ya es el mismo post con retoques, no otro post del mismo tema. */
const MIN_SOLAPE_PALABRAS = 0.8;

/**
 * ¿Este copy es una publicación que el perfil ya hizo?
 *
 * Dos caminos, porque los textos nunca vienen iguales: prefijo canónico largo
 * —lo que sobrevive al truncado del scraper— o solape de palabras alto —lo que
 * sobrevive a una edición en el medio.
 *
 * @returns {object|null} el post publicado, o null si el copy es nuevo
 */
function postYaPublicado({ copy, posts = [] }) {
  const texto = canonizar(copy);
  if (texto.length < MIN_PREFIJO) return null;

  return (
    posts.find((post) => {
      const suyo = canonizar(post?.texto);
      if (suyo.length < MIN_PREFIJO) return false;
      if (prefijoComun(suyo, texto) >= MIN_PREFIJO) return true;
      return solapePalabras(suyo, texto) >= MIN_SOLAPE_PALABRAS;
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

module.exports = {
  postYaPublicado,
  rebobinar,
  prepararMundo,
  canonizar,
  prefijoComun,
  solapePalabras,
  MIN_PREFIJO,
};
