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

module.exports = { resolverPerfiles, normalizarNombre };
