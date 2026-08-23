const { createRng } = require('../../shared/utils/rng');
const { computeWarmth } = require('../warmth/warmth.service');

/**
 * Quién ve el post.
 *
 * Es la capa que faltaba y la que más lejos de la realidad dejaba al panel.
 * Hasta acá el copy se le entregaba al 100% de la red y después se extrapolaba
 * esa tasa a todos los contactos: el resultado era que cuarenta y pico de
 * personas iban a reaccionar a un post que en la vida real junta nueve.
 *
 * En LinkedIn el feed sirve una publicación a una fracción chica de tu red, y
 * esa fracción no es al azar: está sesgada hacia quien te viene leyendo. Eso es
 * lo que se modela acá. La decisión de reaccionar sigue siendo del agente —
 * este módulo solo decide a quién se le pregunta.
 *
 * Todo supuesto viaja declarado en la salida. Un número estimado presentado
 * como observado sería mentir; decir de dónde salió, no.
 */

/**
 * Qué fracción de quienes ven un post reacciona.
 *
 * Es el prior con el que se despeja cuánta gente vio el post cuando LinkedIn no
 * nos da las impresiones — que es el caso normal, porque sin la cookie de una
 * cuenta real ese número no viene. El backtest contra posts ya publicados es lo
 * que permite moverlo con datos en vez de a ojo.
 */
const TASA_REACCION_ENTRE_EXPUESTOS = 0.1;

/**
 * Qué fracción de la red de quien comparte llega a ver el compartido.
 *
 * Un repost no expone a toda la red del que lo hace: entra al feed de esa gente
 * y compite con todo lo demás. Deliberadamente bajo.
 */
const TASA_EXPOSICION_REPOST = 0.02;

/** Cuando `impresiones` sí viene, qué parte de esa audiencia es tu red. */
const PCT_EN_RED = 0.4;

/** Cuánto de la prioridad la decide el calor y cuánto el azar del feed. */
const PESO_CALOR = 0.7;

/** Un panel de una persona no es un panel. */
const MIN_EXPUESTOS = 3;

/** Tamaño de red que se le supone a un contacto que no declara el suyo. */
const RED_POR_CONTACTO = 500;

const media = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const round = (x, d = 1) => Number(x.toFixed(d));
const numero = (valor) => (typeof valor === 'number' && Number.isFinite(valor) ? valor : null);

/** El grado no cargado se asume 1: la red actual se armó de quienes ya reaccionaron. */
const gradoDe = (candidate) => Number(candidate?.grado ?? 1) || 1;

/**
 * Lo que tus posts hicieron de verdad. Es el ancla de todo lo demás.
 *
 * Solo promedia sobre los posts que TRAEN la métrica: un post sin número no es
 * un post con cero, y mezclarlos hunde el promedio inventando publicaciones
 * fracasadas que nunca existieron.
 */
function metricasObservadas(posts = []) {
  const conMetrica = (campo) => posts.map((p) => numero(p[campo])).filter((v) => v !== null);

  const reacciones = conMetrica('totalReacciones');
  const comentarios = conMetrica('interaccionesSociales');
  const compartidos = conMetrica('compartidos');
  const impresiones = conMetrica('impresiones').filter((v) => v > 0);

  return {
    posts: posts.length,
    postsConMetrica: reacciones.length,
    reaccionesPromedio: reacciones.length ? round(media(reacciones)) : null,
    comentariosPromedio: comentarios.length ? round(media(comentarios)) : null,
    compartidosPromedio: compartidos.length ? round(media(compartidos)) : null,
    impresionesPromedio: impresiones.length ? Math.round(media(impresiones)) : null,
  };
}

/**
 * Cuánta gente de tu red ve un post tuyo.
 *
 * Dos caminos y un fallback, en orden de firmeza:
 *
 *   impresiones   dato de LinkedIn Analytics. Solo aparece con la cookie de la
 *                 cuenta propia, así que casi nunca está.
 *   reacciones    se despeja: si un post junta 9 reacciones y reacciona ~1 de
 *                 cada 10 que lo ven, lo vieron ~90.
 *   nada          sin métricas no hay ancla. Se expone la red entera y se dice,
 *                 en vez de fabricar un número con cara de medido.
 */
function estimarExpuestos({ metricas, red }) {
  const acotar = (valor) => Math.max(Math.min(MIN_EXPUESTOS, red), Math.min(red, Math.round(valor)));

  if (metricas.impresionesPromedio) {
    return {
      expuestos: acotar(metricas.impresionesPromedio * PCT_EN_RED),
      fuente:
        `las impresiones reales de tus posts (promedio ${metricas.impresionesPromedio}), de las que se ` +
        `supone un ${Math.round(PCT_EN_RED * 100)}% dentro de tu red`,
      supuesto: 'observado',
    };
  }

  if (metricas.reaccionesPromedio > 0) {
    return {
      expuestos: acotar(metricas.reaccionesPromedio / TASA_REACCION_ENTRE_EXPUESTOS),
      fuente:
        `tus posts promedian ${metricas.reaccionesPromedio} reacciones reales; suponiendo que reacciona ` +
        `1 de cada ${Math.round(1 / TASA_REACCION_ENTRE_EXPUESTOS)} de los que lo ven, lo vieron esa cantidad`,
      supuesto: 'despejado',
    };
  }

  return {
    expuestos: red,
    fuente:
      'no hay métricas cargadas de tus posts, así que no hay con qué estimar cuánta gente los ve: ' +
      'se le muestra el copy a la red entera y el número queda sin ancla. Es la parte más floja.',
    supuesto: 'sin-ancla',
  };
}

/**
 * Cuán cerca está cada contacto, para sesgar el feed hacia quien te viene leyendo.
 *
 * Sale de `warmth.service.computeWarmth`, que ya pesa un comentario cuatro veces
 * más que un like, decae por recencia y normaliza por cuántos posts esa persona
 * pudo ver. Reescribirlo acá sería tener dos definiciones de "cerca".
 */
function calorPorContacto({ candidates, posts }) {
  const reactions = candidates.flatMap((candidate) =>
    (candidate.historialObservado ?? [])
      .filter((evento) => evento.postId)
      .map((evento) => ({
        conexionId: String(candidate.id),
        postId: String(evento.postId),
        tipo: evento.tipo,
      })),
  );

  const { contacts } = computeWarmth({
    connections: candidates.map((c) => ({
      id: String(c.id),
      nombre: c.nombre,
      headline: c.headline ?? '',
      fechaContacto: c.fechaContacto ?? null,
      arquetipoId: null,
    })),
    reactions,
    posts: posts.map((p) => ({ id: String(p.id), ordenCronologico: p.ordenCronologico, fecha: p.fecha })),
  });

  return new Map(contacts.map((c) => [String(c.connectionId), c.score]));
}

/**
 * Ordena a los candidatos por probabilidad de que el feed les muestre el post.
 *
 * El azar no es decorativo: si la exposición fuera puro calor, las mismas
 * treinta personas verían todos tus posts y las otras trescientas ninguno,
 * jamás. El feed no funciona así — un contacto tibio a veces aparece. Semilla
 * fija para que la misma corrida sea reproducible.
 */
function ordenarPorPrioridad({ candidates, calor, seed }) {
  const rng = createRng(`exposicion:${seed}`);
  const maxCalor = Math.max(0, ...[...calor.values()]) || 1;

  return candidates
    .map((candidate) => ({
      candidate,
      prioridad:
        ((calor.get(String(candidate.id)) ?? 0) / maxCalor) * PESO_CALOR +
        rng.next() * (1 - PESO_CALOR),
    }))
    .sort((a, b) => b.prioridad - a.prioridad || String(a.candidate.id).localeCompare(String(b.candidate.id)))
    .map(({ candidate }) => candidate);
}

/**
 * A quién le aparece el post en el feed.
 *
 * Solo primer grado. Un contacto de segundo grado no ve lo que publicás: llega
 * a vos únicamente si alguien de tu red lo comparte, y ese camino lo resuelve
 * `exponerSegundoSalto` DESPUÉS de que el panel haya decidido quién comparte.
 *
 * @returns {{ expuestos, noExpuestos, reservaSegundoGrado, cupo, metricas, fuente, supuesto }}
 */
function exponerPrimerSalto({ candidates, posts, seed = 'panel', limite }) {
  const primerGrado = candidates.filter((c) => gradoDe(c) === 1);
  const segundoGrado = candidates.filter((c) => gradoDe(c) !== 1);

  const metricas = metricasObservadas(posts);
  const estimacion = estimarExpuestos({ metricas, red: primerGrado.length });
  // El tope explícito del llamador manda sobre la estimación: quien pide un
  // panel de 12 quiere pagar 12 llamadas, no noventa.
  const cupo = Math.min(estimacion.expuestos, limite ?? estimacion.expuestos, primerGrado.length);

  const calor = calorPorContacto({ candidates, posts });
  const ordenados = ordenarPorPrioridad({ candidates: primerGrado, calor, seed });

  return {
    expuestos: ordenados.slice(0, cupo),
    noExpuestos: ordenados.slice(cupo),
    reservaSegundoGrado: ordenarPorPrioridad({ candidates: segundoGrado, calor, seed: `${seed}:g2` }),
    cupo,
    redPrimerGrado: primerGrado.length,
    redSegundoGrado: segundoGrado.length,
    metricas,
    fuente: estimacion.fuente,
    supuesto: estimacion.supuesto,
    // Cuando el cupo lo recortó el llamador y no la estimación, el número deja
    // de ser un censo de la exposición y hay que decirlo aguas abajo.
    recortadoPorLimite: cupo < estimacion.expuestos,
    expuestosEstimados: estimacion.expuestos,
  };
}

/**
 * El único camino por el que el segundo grado ve tu post: que alguien lo comparta.
 *
 * Si nadie del panel compartió, esto devuelve vacío — y que devuelva vacío es
 * el resultado correcto, no una falla. Ese era justamente el error de antes:
 * gente de segundo nivel dando like a algo que nunca les llegó.
 *
 * @param {object[]} compartidores personas del primer salto cuya acción fue compartir
 */
function exponerSegundoSalto({ compartidores, reserva, seed = 'panel' }) {
  if (!compartidores?.length || !reserva?.length) {
    return { expuestos: [], alcanceEstimado: 0, porCompartidor: [], supuesto: 'sin-compartidos' };
  }

  const porCompartidor = compartidores.map((persona) => {
    const red = numero(persona.perfil?.conexiones) ?? numero(persona.perfil?.seguidores) ?? RED_POR_CONTACTO;
    const declarado = numero(persona.perfil?.conexiones) !== null || numero(persona.perfil?.seguidores) !== null;
    return {
      nombre: persona.nombre,
      red,
      redDeclarada: declarado,
      alcance: Math.max(1, Math.round(red * TASA_EXPOSICION_REPOST)),
    };
  });

  const alcanceEstimado = porCompartidor.reduce((total, c) => total + c.alcance, 0);
  // Solo se juzga a los que tenemos identificados. El alcance estimado puede ser
  // mucho mayor que la reserva de segundo grado cargada, y esa brecha se declara
  // en vez de rellenarse con gente inventada.
  const juzgables = Math.min(alcanceEstimado, reserva.length);
  void seed;

  return {
    expuestos: reserva.slice(0, juzgables),
    alcanceEstimado,
    porCompartidor,
    supuesto: 'propagado',
  };
}

module.exports = {
  exponerPrimerSalto,
  exponerSegundoSalto,
  metricasObservadas,
  estimarExpuestos,
  calorPorContacto,
  ordenarPorPrioridad,
  gradoDe,
  TASA_REACCION_ENTRE_EXPUESTOS,
  TASA_EXPOSICION_REPOST,
  PCT_EN_RED,
  PESO_CALOR,
  RED_POR_CONTACTO,
  MIN_EXPUESTOS,
};
