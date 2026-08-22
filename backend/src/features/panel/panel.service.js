const AppError = require('../../shared/errors/AppError');
const logger = require('../../shared/logger/logger');
const { mapWithConcurrency } = require('../../shared/utils/pool');
const { selectPanel, selectCandidatePool } = require('./panel.persona');
const llmClient = require('./panel.llm-client');

/**
 * El panel: un agente por contacto real, juzgando tu copy.
 *
 * Tres cosas lo separan de una sola llamada a un LLM pidiéndole "puntuá este
 * post":
 *
 *   HIPERPERSONALIZACIÓN  cada agente es una persona con nombre, trabajo,
 *                         estudios, lo que publica y lo que comparte con vos.
 *                         La objeción que devuelve es de alguien.
 *   DELIBERACIÓN          la segunda ronda ve los comentarios de la primera.
 *                         Así funciona un feed: el primer comentario tiñe a
 *                         los que leen después. Un panel donde todos opinan
 *                         aislados no simula LinkedIn, simula una encuesta.
 *   REPETICIÓN            todo eso se corre varias veces. Un LLM con
 *                         temperatura da respuestas distintas; una sola pasada
 *                         puede haber caído en el extremo de la distribución y
 *                         no hay forma de saberlo desde adentro. Con N pasadas
 *                         la dispersión ES el dato: dice si el veredicto se
 *                         sostiene o si el copy es un caso borde.
 */

const DEFAULTS = { panel: 12, rondas: 2, iteraciones: 3 };
const MAX_CONCURRENCIA = 6;
const REINTENTOS = 1;

/** Un score no significa lo mismo en cada tramo; la banda es lo que se compara. */
const BANDAS = [
  { min: 80, banda: 'fuerte' },
  { min: 60, banda: 'funciona' },
  { min: 35, banda: 'tibio' },
  { min: 0, banda: 'no conecta' },
];

/** Dispersión hasta acá se considera ruido del modelo, no desacuerdo real. */
const UMBRAL_CONVERGENCIA = 6;

const bandaDe = (score) => BANDAS.find((b) => score >= b.min).banda;
const media = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const round = (x, d = 1) => Number(x.toFixed(d));

function desviacion(xs) {
  if (xs.length < 2) return 0;
  const m = media(xs);
  return Math.sqrt(media(xs.map((x) => (x - m) ** 2)));
}

/** Comentar o compartir es público: lo ve el resto del panel. Un like no. */
const esPublico = (turno) => Boolean(turno.comentario) && ['comentar', 'compartir'].includes(turno.accion);

async function conReintento(fn, { descripcion }) {
  let ultimoError;
  for (let intento = 0; intento <= REINTENTOS; intento += 1) {
    try {
      return await fn();
    } catch (error) {
      ultimoError = error;
      logger.warn({ err: error.message, intento, descripcion }, 'turno del panel falló');
    }
  }
  throw ultimoError;
}

/**
 * Una pasada completa del panel: todas las rondas, con el feed acumulando.
 *
 * Las rondas son secuenciales por definición — la ronda 2 no puede empezar
 * antes de que la 1 produzca los comentarios que la 2 lee. Dentro de una
 * ronda los agentes sí van en paralelo: opinan sobre el mismo feed, así que
 * no dependen entre sí.
 */
async function runIteration({ iteracion, copy, icp, panel, rondas, llm }) {
  const turnos = [];
  let feed = [];

  for (let ronda = 1; ronda <= rondas; ronda += 1) {
    const visto = feed.map((t) => ({ nombre: t.nombre, headline: t.headline, comentario: t.comentario }));

    const resultados = await mapWithConcurrency(panel, MAX_CONCURRENCIA, async (persona) => {
      try {
        const veredicto = await conReintento(
          () => llm.judgeCopy({ copy, persona, feed: visto, ronda, icp }),
          { descripcion: `${persona.nombre} ronda ${ronda} iteracion ${iteracion}` },
        );
        return {
          iteracion,
          ronda,
          conexionId: persona.id,
          nombre: persona.nombre,
          headline: persona.headline,
          enriquecido: persona.enriquecido,
          estrato: persona.estrato,
          accion: veredicto.accion,
          score: Math.round(veredicto.score),
          razon: veredicto.razon,
          objecion: veredicto.objecion || null,
          comentario: veredicto.comentario || null,
          influenciadoPor: veredicto.influenciadoPor || null,
          vio: visto.map((v) => v.nombre),
          prompt: veredicto.prompt,
        };
      } catch (error) {
        // Un turno perdido no tumba la corrida, pero tampoco desaparece: se
        // cuenta en cobertura para que nadie lea el score como si el panel
        // completo hubiera opinado.
        return { iteracion, ronda, conexionId: persona.id, nombre: persona.nombre, error: error.message };
      }
    });

    const completados = resultados.filter((t) => !t.error);
    turnos.push(...resultados);
    feed = completados.filter(esPublico);

    // Sin comentarios no hay nada que deliberar: la ronda siguiente le
    // mostraría a cada agente exactamente el mismo feed vacío y devolvería lo
    // mismo por un tercio más de gasto. Se corta y se dice hasta dónde llegó.
    if (feed.length === 0 && ronda < rondas) {
      logger.info({ iteracion, ronda }, 'iteración cortada: la ronda no dejó comentarios');
      break;
    }
  }

  return turnos;
}

/** Hasta qué ronda llegó cada iteración; puede no ser la misma en todas. */
function ultimaRondaPorIteracion(turnos) {
  const porIteracion = new Map();
  for (const turno of turnos) {
    porIteracion.set(turno.iteracion, Math.max(porIteracion.get(turno.iteracion) ?? 0, turno.ronda));
  }
  return porIteracion;
}

/** Los turnos que fijan el veredicto: el último estado de opinión de cada agente. */
function turnosFinales(turnos) {
  const ultima = ultimaRondaPorIteracion(turnos);
  return turnos.filter((t) => !t.error && t.ronda === ultima.get(t.iteracion));
}

/** Cuántos agentes cambiaron de opinión entre la primera ronda y la última. */
function medirDeliberacion({ turnos }) {
  const primeros = turnos.filter((t) => !t.error && t.ronda === 1);
  const ultimos = turnosFinales(turnos);
  const primeroPorAgente = new Map(primeros.map((t) => [`${t.iteracion}:${t.conexionId}`, t]));

  const cambios = ultimos.filter((t) => {
    const antes = primeroPorAgente.get(`${t.iteracion}:${t.conexionId}`);
    return antes && (antes.accion !== t.accion || Math.abs(antes.score - t.score) >= 15);
  });

  const scoreRonda1 = round(media(primeros.map((t) => t.score)));
  const scoreRondaFinal = round(media(ultimos.map((t) => t.score)));

  // Que no haya habido deliberación es un resultado, no un vacío: significa
  // que nadie escribió nada que otro pudiera leer. Se dice, en vez de dejar un
  // delta de 0 que se leería como "deliberaron y no cambió nada".
  const ocurrio = ultimos.some((t) => t.ronda > 1);

  return {
    ocurrio,
    nota: ocurrio
      ? null
      : 'Ninguna corrida pasó de la primera ronda: nadie del panel comentó, así que no hubo nada que el resto pudiera leer. El score es el juicio individual de cada uno.',
    scoreRonda1,
    scoreRondaFinal,
    delta: round(scoreRondaFinal - scoreRonda1),
    cambiosDeOpinion: cambios.length,
    influencias: ultimos
      .filter((t) => t.influenciadoPor)
      .map((t) => ({ agente: t.nombre, influenciadoPor: t.influenciadoPor, iteracion: t.iteracion })),
  };
}

/**
 * Agrupa objeciones por texto exacto normalizado.
 *
 * No agrupa por significado: dos formas de decir lo mismo cuentan como dos.
 * Agrupar semánticamente pediría otra llamada al modelo y una objeción mal
 * fusionada es peor que una repetida — la síntesis de mejoras recibe la lista
 * completa igual.
 */
function agruparObjeciones(turnos) {
  const porTexto = new Map();
  for (const turno of turnos) {
    if (!turno.objecion) continue;
    const clave = turno.objecion.toLowerCase().replace(/\s+/g, ' ').trim();
    const actual = porTexto.get(clave);
    if (actual) actual.veces += 1;
    else porTexto.set(clave, { texto: turno.objecion, veces: 1, de: turno.nombre });
  }

  return [...porTexto.values()].sort((a, b) => b.veces - a.veces);
}

function resumirPanel({ panel, turnos }) {
  const finales = turnosFinales(turnos);

  return panel.map((persona) => {
    const suyos = finales.filter((t) => String(t.conexionId) === persona.id);
    const historial = turnos
      .filter((t) => String(t.conexionId) === persona.id)
      .sort((a, b) => a.iteracion - b.iteracion || a.ronda - b.ronda)
      .map((t) => ({
        iteracion: t.iteracion,
        ronda: t.ronda,
        // Todos los agentes reciben el copy. "ignorar" significa que lo leyó
        // y decidió no reaccionar; un error sí deja la observación inconclusa.
        vioElCopy: !t.error,
        accion: t.error ? 'error' : t.accion,
        score: t.error ? null : t.score,
        razon: t.error ? t.error : t.razon,
        objecion: t.objecion ?? null,
        comentario: t.comentario ?? null,
        influenciadoPor: t.influenciadoPor ?? null,
        vioComentarios: t.vio ?? [],
      }));
    const acciones = suyos.reduce((acc, t) => ({ ...acc, [t.accion]: (acc[t.accion] ?? 0) + 1 }), {});
    const dominante = Object.entries(acciones).sort((a, b) => b[1] - a[1])[0];

    return {
      id: persona.id,
      nombre: persona.nombre,
      headline: persona.headline,
      fotoUrl: persona.fotoUrl,
      enriquecido: persona.enriquecido,
      estrato: persona.estrato,
      scoreMedio: suyos.length ? round(media(suyos.map((t) => t.score))) : null,
      accionDominante: dominante ? dominante[0] : null,
      // Un agente que hace lo mismo en las N iteraciones es una señal firme;
      // uno que oscila dice que el copy lo deja indiferente.
      consistente: dominante ? dominante[1] === suyos.length : false,
      objeciones: [...new Set(suyos.map((t) => t.objecion).filter(Boolean))],
      historial,
    };
  });
}

/**
 * Evalúa un copy contra el panel.
 *
 * @param {object}   params
 * @param {string}   params.copy
 * @param {object[]} params.candidates  contactos con perfil enriquecido e interacciones
 * @param {string}   [params.icp]
 * @param {number}   [params.panelSize]
 * @param {number}   [params.rondas]
 * @param {number}   [params.iteraciones]
 * @param {string}   [params.seed]      fija el panel; repetirla reproduce el mismo jurado
 */
async function evaluateCopy({
  copy,
  candidates,
  icp,
  panelSize = DEFAULTS.panel,
  rondas = DEFAULTS.rondas,
  iteraciones = DEFAULTS.iteraciones,
  seed = 'panel',
  llm = llmClient,
} = {}) {
  if (!candidates?.length) {
    throw AppError.conflict(
      'No hay contactos cargados para este perfil: sin red no hay panel que pueda juzgar el copy.',
    );
  }

  const candidatePool = selectCandidatePool({ candidates, seed });
  const panel = selectPanel({ candidates: candidatePool, size: panelSize, seed });

  // Las iteraciones son independientes entre sí: es exactamente el punto —
  // cada una es una realización distinta del mismo experimento.
  const porIteracionTurnos = await Promise.all(
    Array.from({ length: iteraciones }, (unused, i) =>
      runIteration({ iteracion: i + 1, copy, icp, panel, rondas, llm })),
  );
  const turnos = porIteracionTurnos.flat();
  const completados = turnos.filter((t) => !t.error);
  const finales = turnosFinales(turnos);

  if (finales.length === 0) {
    throw AppError.badGateway(
      'Ningún agente del panel pudo evaluar el copy: todas las llamadas al modelo fallaron.',
    );
  }

  const porIteracion = porIteracionTurnos.map((iteracionTurnos, i) => {
    const ultimos = turnosFinales(iteracionTurnos);
    const score = round(media(ultimos.map((t) => t.score)));
    return {
      iteracion: i + 1,
      score,
      banda: bandaDe(score),
      // Puede ser menor que las pedidas: una ronda sin comentarios corta la
      // deliberación porque no queda nada que la siguiente pueda leer.
      rondasCorridas: Math.max(...iteracionTurnos.map((t) => t.ronda)),
      tasaEngagement: round((ultimos.filter((t) => t.accion !== 'ignorar').length / (ultimos.length || 1)) * 100),
      comentarios: ultimos.filter((t) => t.accion === 'comentar').length,
      compartidos: ultimos.filter((t) => t.accion === 'compartir').length,
      likes: ultimos.filter((t) => t.accion === 'like').length,
      ignorados: ultimos.filter((t) => t.accion === 'ignorar').length,
      agentes: ultimos.length,
    };
  });

  const scoresIteracion = porIteracion.map((it) => it.score);
  const score = round(media(scoresIteracion));
  const dispersion = round(desviacion(scoresIteracion));
  const bandas = new Set(porIteracion.map((it) => it.banda));
  const convergio = dispersion <= UMBRAL_CONVERGENCIA && bandas.size === 1;

  const objeciones = agruparObjeciones(finales);
  const comentarios = finales
    .filter((t) => t.comentario)
    .map((t) => ({
      nombre: t.nombre,
      headline: t.headline,
      comentario: t.comentario,
      iteracion: t.iteracion,
      accion: t.accion,
    }));

  const veredicto = convergio
    ? `El panel converge: ${score}/100 (${bandaDe(score)}) con dispersión de ${dispersion} puntos entre ${iteraciones} corridas.`
    : `El panel NO converge: ${score}/100 de promedio pero las corridas van de ${Math.min(...scoresIteracion)} a ${Math.max(...scoresIteracion)}${bandas.size > 1 ? ` y cruzan bandas (${[...bandas].join(', ')})` : ''}. Este copy es un caso borde: con este panel el resultado depende del azar.`;

  const evidencia = {
    panel: panel.length,
    iteraciones,
    score,
    tasaEngagement: round(media(porIteracion.map((it) => it.tasaEngagement))),
    objeciones: objeciones.slice(0, 8),
    comentarios: comentarios.slice(0, 10),
  };

  let mejoras = null;
  try {
    mejoras = await llm.suggestImprovements({ copy, icp, evidencia });
  } catch (error) {
    // El veredicto ya está medido; perder la síntesis no invalida la corrida.
    logger.warn({ err: error.message }, 'no se pudo sintetizar las mejoras');
  }

  return {
    configuracion: {
      panel: panel.length,
      rondas,
      iteraciones,
      modelo: llm.MODEL ?? llmClient.MODEL,
      semilla: String(seed),
    },
    score,
    banda: bandaDe(score),
    dispersion,
    convergio,
    veredicto,
    // El panel mide reacción cualitativa, no volumen. A doce personas se les
    // pidió sentarse a leer y opinar; en el feed real la mayoría ni ve el
    // post. Quien lea la tasa de engagement del panel como la tasa esperada
    // de LinkedIn se va a llevar un chasco, y el proyecto ya tiene un motor
    // calibrado contra reacciones observadas para esa otra pregunta.
    comoLeerlo:
      'El score y las objeciones dicen QUÉ tan bien le habla el copy a tu red y por qué falla. ' +
      'La tasa de engagement NO es una predicción de alcance: al panel se le pidió deliberar, ' +
      'así que comenta mucho más de lo que comentaría en el feed real. Cuánta gente reaccionaría ' +
      'lo responde la predicción calibrada contra tus reacciones observadas, no esto.',
    porIteracion,
    deliberacion: medirDeliberacion({ turnos }),
    panel: resumirPanel({ panel, turnos }),
    objeciones,
    comentarios,
    cobertura: {
      candidatosDisponibles: candidates.length,
      candidatosElegibles: candidatePool.length,
      // Lo esperado es el techo: una iteración cortada por falta de
      // comentarios gasta menos, y eso se lee en rondasCorridas.
      turnosEsperados: panel.length * rondas * iteraciones,
      turnosCorridos: turnos.length,
      turnosCompletados: completados.length,
      turnosPerdidos: turnos.length - completados.length,
      agentesEnriquecidos: panel.filter((p) => p.enriquecido).length,
    },
    mejoras,
    turnos,
  };
}

module.exports = { evaluateCopy, agruparObjeciones, medirDeliberacion, bandaDe, DEFAULTS, UMBRAL_CONVERGENCIA };
