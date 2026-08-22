const profilesRepository = require('./perfiles.repository');

/**
 * Ingesta del enriquecimiento de perfiles.
 *
 * El scraper devuelve personas, no ids: el único nexo con la red ya cargada es
 * el nombre. Resolverlo tiene un riesgo obvio — dos personas se pueden llamar
 * igual — así que acá se resuelve de forma explícita y lo que no se resuelve
 * se devuelve en una lista, no se descarta en silencio. Un perfil pegado a la
 * conexión equivocada haría que un agente opine con la vida de otro.
 */

/** Nombre comparable: sin tildes, sin dobles espacios, en minúscula. */
function normalizarNombre(nombre) {
  return String(nombre ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function indexarPorNombre(conexiones) {
  const porNombre = new Map();
  for (const conexion of conexiones) {
    const clave = normalizarNombre(conexion.nombre);
    const actual = porNombre.get(clave);
    if (actual) actual.push(conexion);
    else porNombre.set(clave, [conexion]);
  }
  return porNombre;
}

function texto(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function nonNegativeOrNull(value) {
  const normalized = numberOrNull(value);
  return normalized === null ? null : Math.max(0, normalized);
}

function probabilityOrNull(value) {
  const normalized = numberOrNull(value);
  return normalized === null ? null : Math.max(0, Math.min(1, normalized));
}

function normalizeExperience(items) {
  if (!Array.isArray(items)) return null;
  const normalized = items
    .map((item) => ({
      cargo: texto(item?.cargo ?? item?.title ?? item?.position ?? item?.role),
      empresa: texto(item?.empresa ?? item?.company ?? item?.companyName ?? item?.organization),
      desde: texto(item?.desde ?? item?.startDate ?? item?.start),
      hasta: texto(item?.hasta ?? item?.endDate ?? item?.end),
    }))
    .filter((item) => item.cargo || item.empresa);
  return normalized.length ? normalized : null;
}

function normalizeEducation(items) {
  if (!Array.isArray(items)) return null;
  const normalized = items
    .map((item) => ({
      institucion: texto(item?.institucion ?? item?.school ?? item?.schoolName ?? item?.institution),
      titulo: texto(item?.titulo ?? item?.degree ?? item?.fieldOfStudy),
      anio: item?.anio ?? item?.year ?? item?.endYear ?? null,
    }))
    .filter((item) => item.institucion || item.titulo);
  return normalized.length ? normalized : null;
}

/** Convierte exactamente la salida del actor a la fila vigente del contacto. */
function actorProfilesFromMatches({ runId, matches }) {
  return matches.map(({ connectionId, contact }) => ({
    conexion_id: Number(connectionId),
    actor_run_id: runId,
    descripcion: texto(contact.description ?? contact.about ?? contact.summary),
    cargo_actual: texto(contact.currentTitle ?? contact.position),
    empresa_actual: texto(contact.currentCompany ?? contact.company),
    sector: texto(contact.industry),
    ubicacion: texto(contact.location),
    experiencia: normalizeExperience(contact.workHistory),
    educacion: normalizeEducation(contact.education),
    publicaciones: null,
    en_comun: null,
    seguidores: nonNegativeOrNull(contact.followers),
    conexiones: nonNegativeOrNull(contact.connectionsCount),
    foto_url: texto(contact.photoUrl),
    linkedin_url: texto(contact.url),
    grado_grafo: nonNegativeOrNull(contact.degree),
    es_icp: typeof contact.isIcp === 'boolean' ? contact.isIcp : null,
    confianza_icp: probabilityOrNull(contact.confidence),
    razon_icp: texto(contact.reason),
    fuente: 'apify-founder-network-graph',
  }));
}

async function ingestActorAudience({
  perfilUrl,
  runId,
  startedAt,
  finishedAt,
  contactsTotal,
  matches,
  repository = profilesRepository,
}) {
  const rows = actorProfilesFromMatches({ runId, matches });
  const profilesWritten = await repository.saveActorAudience({
    perfilUrl,
    runId,
    startedAt,
    finishedAt,
    contactsTotal,
    rows,
  });
  return { profilesWritten, profilesMatched: rows.length };
}

/**
 * Cruza los perfiles recibidos contra la red cargada.
 *
 * @returns {{ filas, resueltos, sinResolver, ambiguos }}
 */
function resolverPerfiles({ perfiles, conexiones }) {
  const porId = new Map(conexiones.map((c) => [String(c.id), c]));
  const porNombre = indexarPorNombre(conexiones);

  const filas = [];
  const resueltos = [];
  const sinResolver = [];
  const ambiguos = [];

  for (const perfil of perfiles) {
    let conexion = perfil.conexionId ? porId.get(String(perfil.conexionId)) : undefined;

    if (!conexion && perfil.nombre) {
      const candidatas = porNombre.get(normalizarNombre(perfil.nombre)) ?? [];
      if (candidatas.length === 1) [conexion] = candidatas;
      else if (candidatas.length > 1) {
        // Homónimos: elegir uno sería jugarse a que salga bien. Se informa.
        ambiguos.push({ nombre: perfil.nombre, candidatas: candidatas.map((c) => c.id) });
        continue;
      }
    }

    if (!conexion) {
      sinResolver.push(perfil.nombre ?? perfil.conexionId ?? 'sin identificador');
      continue;
    }

    filas.push({
      conexion_id: Number(conexion.id),
      descripcion: perfil.descripcion ?? null,
      cargo_actual: perfil.cargoActual ?? null,
      empresa_actual: perfil.empresaActual ?? null,
      sector: perfil.sector ?? null,
      ubicacion: perfil.ubicacion ?? null,
      experiencia: perfil.experiencia ?? null,
      educacion: perfil.educacion ?? null,
      publicaciones: perfil.publicaciones ?? null,
      en_comun: perfil.enComun ?? null,
      seguidores: perfil.seguidores ?? null,
      fuente: perfil.fuente ?? null,
    });
    resueltos.push({ conexionId: conexion.id, nombre: conexion.nombre });
  }

  return { filas, resueltos, sinResolver, ambiguos };
}

module.exports = {
  resolverPerfiles,
  normalizarNombre,
  normalizeExperience,
  normalizeEducation,
  numberOrNull,
  nonNegativeOrNull,
  probabilityOrNull,
  actorProfilesFromMatches,
  ingestActorAudience,
};
