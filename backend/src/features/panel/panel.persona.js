const { createRng } = require('../../shared/utils/rng');

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
const MAX_CANDIDATES = 200;

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
 */
function lineaVinculo({ interacciones, comentariosPrevios, fechaContacto }) {
  const partes = [];
  if (interacciones > 0) {
    partes.push(`Ya reaccionaste ${interacciones} ${interacciones === 1 ? 'vez' : 'veces'} a sus publicaciones`);
  } else {
    partes.push('Nunca reaccionaste a nada suyo, aunque están conectados');
  }
  if (comentariosPrevios?.length) {
    partes.push(`Le comentaste antes: "${limpiar(comentariosPrevios[0]).slice(0, 160)}"`);
  }
  if (fechaContacto) partes.push(`Conectados desde ${fechaContacto}`);
  return partes.join('. ');
}

/**
 * Arma la ficha que el agente recibe como identidad.
 *
 * @returns {{ id, nombre, headline, enriquecido, estrato, ficha }}
 */
function buildPersona(candidate) {
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
    `Tu relación con quien publica: ${lineaVinculo(candidate)}`,
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
    ficha: bloques.join('\n'),
  };
}

function candidateRichness(candidate) {
  const profile = candidate.perfil ?? {};
  return [
    profile.descripcion,
    profile.cargoActual,
    profile.empresaActual,
    profile.ubicacion,
    profile.experiencia?.length,
    profile.educacion?.length,
    profile.publicaciones?.length,
    profile.seguidores,
    profile.conexiones,
    profile.fotoUrl,
  ].filter(Boolean).length;
}

/**
 * Reduce redes grandes sin convertir los primeros 200 registros del scraper
 * en toda la audiencia. Se toma uno por empresa/cargo en rondas sucesivas.
 */
function selectCandidatePool({ candidates, limit = MAX_CANDIDATES, seed = 'panel' }) {
  if (candidates.length <= limit) return [...candidates];

  const groups = new Map();
  for (const candidate of candidates) {
    const profile = candidate.perfil ?? {};
    const key = limpiar(profile.empresaActual || profile.cargoActual || candidate.headline || 'sin-contexto')
      .toLowerCase();
    const group = groups.get(key) ?? [];
    group.push(candidate);
    groups.set(key, group);
  }

  const rng = createRng(`pool:${seed}:${limit}`);
  const orderedGroups = [...groups.entries()]
    .map(([key, members]) => ({ key, members, random: rng.next() }))
    .sort((a, b) => a.random - b.random || a.key.localeCompare(b.key))
    .map(({ members }) => members.sort((a, b) =>
      candidateRichness(b) - candidateRichness(a) ||
      Number(b.perfil?.gradoGrafo ?? 0) - Number(a.perfil?.gradoGrafo ?? 0) ||
      Number(b.perfil?.conexiones ?? 0) - Number(a.perfil?.conexiones ?? 0) ||
      String(a.id).localeCompare(String(b.id))));

  const selected = [];
  for (let round = 0; selected.length < limit; round += 1) {
    let added = false;
    for (const group of orderedGroups) {
      if (group[round]) {
        selected.push(group[round]);
        added = true;
        if (selected.length === limit) break;
      }
    }
    if (!added) break;
  }
  return selected;
}

/**
 * Elige el panel.
 *
 * Dos reglas y el resto es azar con semilla:
 *
 *   1. Mitad núcleo, mitad silenciosos. Un panel solo de los que ya te
 *      aplauden devuelve un 90 siempre y no sirve para decidir nada; uno solo
 *      de silenciosos ignora a quienes de verdad te leen.
 *   2. Dentro de cada mitad, primero los enriquecidos. Un agente con historia
 *      laboral y contenido propio da una objeción concreta; uno con solo el
 *      headline da una genérica.
 *
 * El panel NO cambia entre iteraciones: si cambiara, la varianza entre
 * corridas mezclaría dos causas — el azar de la deliberación y el de a quién
 * le tocó opinar — y no se podría atribuir a ninguna.
 */
function selectPanel({ candidates, size, seed }) {
  const rng = createRng(`panel:${seed}:${size}`);
  const ordenar = (lista) =>
    [...lista]
      .map((c) => ({ c, r: rng.next() }))
      .sort((a, b) => {
        const enriquecidoA = candidateRichness(a.c);
        const enriquecidoB = candidateRichness(b.c);
        if (enriquecidoA !== enriquecidoB) return enriquecidoB - enriquecidoA;
        return a.r - b.r;
      })
      .map(({ c }) => c);

  const nucleo = ordenar(candidates.filter((c) => c.interacciones > 0));
  const silenciosos = ordenar(candidates.filter((c) => !(c.interacciones > 0)));

  const cupoNucleo = Math.min(nucleo.length, Math.ceil(size / 2));
  const elegidos = [
    ...nucleo.slice(0, cupoNucleo),
    ...silenciosos.slice(0, size - cupoNucleo),
  ];
  // Si un estrato no llenó su cupo, el otro lo cubre: un panel de 8 cuando se
  // pidieron 12 es peor que uno desbalanceado.
  if (elegidos.length < size) {
    const yaElegidos = new Set(elegidos.map((c) => String(c.id)));
    elegidos.push(
      ...[...nucleo, ...silenciosos]
        .filter((c) => !yaElegidos.has(String(c.id)))
        .slice(0, size - elegidos.length),
    );
  }

  return elegidos.map(buildPersona);
}

module.exports = {
  buildPersona,
  selectPanel,
  selectCandidatePool,
  candidateRichness,
  MAX_CANDIDATES,
};
