/**
 * De contacto scrapeado a persona que puede opinar.
 *
 * La diferencia con el motor de arquetipos es deliberada. Un arquetipo dice
 * "founder early-stage escéptico del precio" y todos los que caen ahí opinan
 * igual. Acá cada agente es UNA persona con su nombre, su trabajo, dónde
 * estudió, de qué habla y qué comparte con vos. Eso es lo que hace que la
 * objeción que devuelve sea la objeción de alguien y no el promedio de un
 * segmento.
 *
 * Lo que no está scrapeado no se rellena: un perfil sin descripción se
 * presenta sin descripción. Inventarle un about al modelo sería pedirle que
 * juzgue tu copy desde una persona que no existe.
 */

/** Cuánto contenido propio se le muestra al agente: suficiente para fijar tono. */
const MAX_PUBLICACIONES = 3;
const MAX_EXPERIENCIA = 2;
const MAX_EDUCACION = 2;
const RECORTE_PUBLICACION = 240;
/** Cuántas interacciones suyas se listan, y cuántos posts que dejó pasar. */
const MAX_EVENTOS = 4;
const MAX_IGNORADOS = 3;
const RECORTE_HOOK = 90;

const limpiar = (valor) => String(valor ?? '').trim();

function lineaExperiencia(item) {
  const cargo = limpiar(item?.cargo);
  const empresa = limpiar(item?.empresa);
  const desde = limpiar(item?.desde);
  const hasta = limpiar(item?.hasta) || 'hoy';
  const periodo = desde ? ` (${desde} – ${hasta})` : '';
  return [cargo, empresa].filter(Boolean).join(' en ') + periodo;
}

function lineaEducacion(item) {
  const titulo = limpiar(item?.titulo);
  const institucion = limpiar(item?.institucion);
  const anio = limpiar(item?.anio);
  return [[titulo, institucion].filter(Boolean).join(' — '), anio].filter(Boolean).join(', ');
}

function lineaEnComun(enComun) {
  if (!enComun) return '';
  const partes = [];
  const empresas = (enComun.empresas ?? []).filter(Boolean);
  const instituciones = (enComun.instituciones ?? []).filter(Boolean);
  const grupos = (enComun.grupos ?? []).filter(Boolean);
  if (empresas.length) partes.push(`pasaron por ${empresas.join(', ')}`);
  if (instituciones.length) partes.push(`estudiaron en ${instituciones.join(', ')}`);
  if (grupos.length) partes.push(`comparten los grupos ${grupos.join(', ')}`);
  if (enComun.conexionesMutuas) partes.push(`${enComun.conexionesMutuas} conexiones en común`);
  return partes.join('; ');
}

/**
 * El vínculo con el autor, en palabras.
 *
 * Importa tanto como el cargo: la misma persona lee distinto un copy de
 * alguien a quien le comenta hace meses que de alguien a quien nunca le dio
 * un like.
 *
 * Y pesa igual lo que NO hizo. Antes acá solo entraban los aciertos —las cuatro
 * veces que reaccionó— y el agente se leía a sí mismo como un fan: nada le
 * decía que había dejado pasar las otras doce publicaciones, ni que jamás había
 * comentado una. Con la mitad de la historia visible, contestaba que sí a todo.
 * Los silencios son el dato que lo vuelve una persona y no un aplaudidor.
 */
function lineaVinculo(candidate, comportamiento) {
  const { interacciones, comentariosPrevios, fechaContacto, historialObservado } = candidate;
  const partes = [];
  const eventos = (historialObservado ?? []).slice(0, MAX_EVENTOS);

  if (eventos.length) {
    partes.push('Esto ya lo hiciste con publicaciones suyas — es observado, no inventado:');
    for (const evento of eventos) partes.push(`- ${describirEvento(evento)}`);
    const resto = (interacciones ?? 0) - eventos.length;
    if (resto > 0) partes.push(`Y ${resto} interacción${resto === 1 ? '' : 'es'} más.`);
  } else if (interacciones > 0) {
    partes.push(`Ya reaccionaste ${interacciones} ${interacciones === 1 ? 'vez' : 'veces'} a sus publicaciones.`);
  } else {
    partes.push('Nunca reaccionaste a nada suyo, aunque están conectados.');
  }

  partes.push(...lineasDeComportamiento(comportamiento, interacciones ?? 0));

  if (comentariosPrevios?.length && !eventos.some((e) => e.comentario)) {
    partes.push(`Le comentaste antes: "${limpiar(comentariosPrevios[0]).slice(0, 160)}"`);
  }
  if (fechaContacto) partes.push(`Conectados desde ${fechaContacto}`);
  return partes.join('\n');
}

/**
 * Cada cuánto reacciona esta persona, de qué forma y qué dejó pasar.
 *
 * Nada de esto se estima: sale de cruzar sus reacciones observadas contra las
 * publicaciones que tuvo enfrente. Cuando falta el dato para una de las cuatro
 * líneas, la línea no aparece — inventarle una frecuencia sería pedirle al
 * agente que sea coherente con una historia que no existe.
 */
function lineasDeComportamiento(comportamiento, interacciones) {
  if (!comportamiento) return [];
  const lineas = [];
  const { oportunidades, oportunidadesEstimadas, postsConReaccion, mezcla, brechaPosts, ignorados } = comportamiento;

  if (oportunidades) {
    const ventana = oportunidadesEstimadas
      ? `las ${oportunidades} publicaciones suyas que conocemos`
      : `las ${oportunidades} publicaciones suyas que te aparecieron desde que están conectados`;
    lineas.push(
      postsConReaccion > 0
        ? `De ${ventana}, reaccionaste a ${postsConReaccion}. Al resto le seguiste de largo.`
        : `De ${ventana}, no reaccionaste a ninguna.`,
    );
  }

  if (interacciones > 0 && mezcla) {
    const plural = (n, singular, pluralForma) => `${n} ${n === 1 ? singular : pluralForma}`;
    lineas.push(
      'Cuando reaccionás a algo suyo, es así: ' +
        [
          plural(mezcla.like, 'like', 'likes'),
          plural(mezcla.comentar, 'comentario', 'comentarios'),
          plural(mezcla.compartir, 'compartido', 'compartidos'),
        ].join(', ') + '.',
    );
    if (!mezcla.comentar) lineas.push('Nunca le comentaste: comentarle no es algo que hagas con esta persona.');
    if (!mezcla.compartir) lineas.push('Nunca compartiste nada suyo con tu propia red.');
  }

  if (brechaPosts > 0) {
    lineas.push(`Hace ${brechaPosts} publicaciones suyas que no reaccionás a nada.`);
  }

  if (ignorados?.length) {
    lineas.push('Estas también te aparecieron en el feed y seguiste de largo:');
    for (const post of ignorados) lineas.push(`- «${post.hook}»`);
  }

  return lineas;
}

/**
 * Cuántas publicaciones tuvo enfrente esta persona.
 *
 * La ventana arranca en la fecha de contacto: alguien conectado la semana
 * pasada vio dos posts, y juzgarlo contra los catorce lo haría parecer mucho
 * más selectivo de lo que es. Sin fechas —que es el caso de la red armada desde
 * el engagement— se toman todas y se declara que la ventana es estimada.
 */
function ventanaDeOportunidad(candidate, posts) {
  if (!posts?.length) return { oportunidades: null, visibles: [], estimado: false };

  const conFecha = posts.filter((p) => p.fecha);
  if (!conFecha.length || !candidate.fechaContacto) {
    return { oportunidades: posts.length, visibles: posts, estimado: true };
  }

  const desde = new Date(candidate.fechaContacto).getTime();
  if (!Number.isFinite(desde)) return { oportunidades: posts.length, visibles: posts, estimado: true };

  const visibles = conFecha.filter((p) => new Date(p.fecha).getTime() >= desde);
  return { oportunidades: visibles.length, visibles, estimado: false };
}

/**
 * El perfil de conducta de esta persona con vos, en números.
 *
 * Viaja junto a la ficha para que el motor y la UI puedan leer exactamente lo
 * mismo que leyó el agente, sin volver a parsear el texto de la ficha.
 */
function comportamientoDe(candidate, posts = []) {
  const eventos = candidate.historialObservado ?? [];
  const { oportunidades, visibles, estimado } = ventanaDeOportunidad(candidate, posts);
  const alcanzados = new Set(eventos.map((e) => e.postId).filter(Boolean).map(String));
  const interacciones = candidate.interacciones ?? 0;
  const mezclaCruda = candidate.reaccionesPorTipo ?? {};

  const ultimoOrden = posts.reduce((max, p) => Math.max(max, p.ordenCronologico ?? 0), 0);
  const ordenes = eventos.map((e) => e.orden).filter((o) => Number.isFinite(o));

  // Una persona puede haber likeado Y comentado el mismo post: contar filas
  // daría una tasa por encima de 1. Lo que se cuenta son publicaciones tocadas.
  const postsConReaccion = alcanzados.size || Math.min(interacciones, oportunidades ?? interacciones);

  const ignorados = visibles
    .filter((p) => !alcanzados.has(String(p.id)))
    .sort((a, b) => (b.ordenCronologico ?? 0) - (a.ordenCronologico ?? 0))
    .slice(0, MAX_IGNORADOS)
    .map((p) => ({
      hook: limpiar(p.texto).replace(/\s+/g, ' ').slice(0, RECORTE_HOOK),
      orden: p.ordenCronologico ?? null,
      fecha: p.fecha ?? null,
    }))
    .filter((p) => p.hook);

  return {
    oportunidades,
    oportunidadesEstimadas: estimado,
    postsConReaccion,
    interacciones,
    tasa: oportunidades ? Number(Math.min(1, postsConReaccion / oportunidades).toFixed(3)) : null,
    mezcla: {
      like: mezclaCruda.like ?? 0,
      comentar: mezclaCruda.comentar ?? 0,
      compartir: mezclaCruda.compartir ?? 0,
    },
    brechaPosts: ordenes.length && ultimoOrden ? ultimoOrden - Math.max(...ordenes) : null,
    ignorados,
  };
}

function describirEvento(evento) {
  const cuando = evento.fecha ? `El ${String(evento.fecha).slice(0, 10)} ` : '';
  const gancho = evento.hook ? `«${limpiar(evento.hook).slice(0, 90)}»` : 'una publicación suya';
  if (evento.tipo === 'comentario' || evento.comentario) {
    const dicho = evento.comentario ? `: "${limpiar(evento.comentario).slice(0, 120)}"` : '';
    return `${cuando}le comentaste ${gancho}${dicho}`;
  }
  const gesto = evento.subtipo === 'love' ? 'empatizaste (corazón) con'
    : evento.subtipo === 'celebrate' ? 'celebraste'
    : 'le diste like a';
  return `${cuando}${gesto} ${gancho}`;
}

/**
 * Arma la ficha que el agente recibe como identidad.
 *
 * @param {object}   candidate
 * @param {object}   [contexto]
 * @param {object[]} [contexto.posts] publicaciones del dueño, para saber qué dejó pasar
 * @returns {{ id, nombre, headline, enriquecido, estrato, grado, ficha, comportamiento }}
 */
function buildPersona(candidate, { posts = [] } = {}) {
  const comportamiento = comportamientoDe(candidate, posts);
  const perfil = candidate.perfil ?? {};
  const publicaciones = (perfil.publicaciones ?? [])
    .filter((p) => limpiar(p?.texto))
    .slice(0, MAX_PUBLICACIONES);
  const experiencia = (perfil.experiencia ?? []).slice(0, MAX_EXPERIENCIA);
  const educacion = (perfil.educacion ?? []).slice(0, MAX_EDUCACION);
  const enComun = lineaEnComun(perfil.enComun);

  const bloques = [
    `Sos ${candidate.nombre}.`,
    limpiar(candidate.headline) && `Tu headline: ${limpiar(candidate.headline)}`,
    limpiar(perfil.cargoActual) &&
      `Hoy trabajás como ${limpiar(perfil.cargoActual)}${limpiar(perfil.empresaActual) ? ` en ${limpiar(perfil.empresaActual)}` : ''}.`,
    limpiar(perfil.sector) && `Sector: ${limpiar(perfil.sector)}`,
    limpiar(perfil.ubicacion) && `Ubicación: ${limpiar(perfil.ubicacion)}`,
    perfil.seguidores !== null && perfil.seguidores !== undefined &&
      Number.isFinite(Number(perfil.seguidores)) && `Seguidores visibles: ${Number(perfil.seguidores)}`,
    perfil.conexiones !== null && perfil.conexiones !== undefined &&
      Number.isFinite(Number(perfil.conexiones)) && `Conexiones visibles: ${Number(perfil.conexiones)}`,
    perfil.gradoGrafo !== null && perfil.gradoGrafo !== undefined && Number.isFinite(Number(perfil.gradoGrafo)) &&
      `Conectividad dentro de esta audiencia: ${Number(perfil.gradoGrafo)} vínculos modelados u observados.`,
    limpiar(perfil.descripcion) && `Cómo te describís:\n${limpiar(perfil.descripcion)}`,
    experiencia.length && `Tu trayectoria:\n${experiencia.map((e) => `- ${lineaExperiencia(e)}`).join('\n')}`,
    educacion.length && `Dónde estudiaste:\n${educacion.map((e) => `- ${lineaEducacion(e)}`).join('\n')}`,
    publicaciones.length &&
      `De qué hablás cuando publicás:\n${publicaciones
        .map((p) => `- "${limpiar(p.texto).slice(0, RECORTE_PUBLICACION)}"`)
        .join('\n')}`,
    enComun && `Lo que compartís con quien publica: ${enComun}`,
    `Tu relación con quien publica:\n${lineaVinculo(candidate, comportamiento)}`,
  ].filter(Boolean);

  return {
    id: String(candidate.id),
    nombre: candidate.nombre,
    headline: candidate.headline ?? null,
    fotoUrl: perfil.fotoUrl ?? null,
    // Sin dato enriquecido el agente opina solo desde el headline. Sigue
    // sirviendo, pero el consumidor tiene que poder saber cuál es cuál.
    enriquecido: Boolean(
      limpiar(perfil.descripcion) ||
        limpiar(perfil.cargoActual) ||
        limpiar(perfil.empresaActual) ||
        limpiar(perfil.ubicacion) ||
        experiencia.length ||
        educacion.length ||
        publicaciones.length,
    ),
    estrato: candidate.interacciones > 0 ? 'nucleo' : 'silencioso',
    // Sin grado cargado se asume primer grado, igual que en el repositorio.
    grado: Number(candidate.grado ?? 1) || 1,
    ficha: bloques.join('\n'),
    comportamiento,
    perfil: candidate.perfil ?? null,
    historialObservado: candidate.historialObservado ?? [],
  };
}

/**
 * De una lista ya elegida a personas que pueden opinar.
 *
 * Quién entra ya no lo decide una cuota de estratos —antes era mitad núcleo,
 * mitad silenciosos— sino la puerta de exposición: quién vería el post en su
 * feed. Acá solo se los viste de identidad.
 */
function buildPanel({ candidates, posts = [] }) {
  return candidates.map((candidate) => buildPersona(candidate, { posts }));
}

module.exports = {
  buildPersona,
  buildPanel,
  comportamientoDe,
  ventanaDeOportunidad,
  describirEvento,
};
