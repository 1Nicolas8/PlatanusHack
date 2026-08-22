const { resolverPerfiles, normalizarNombre } = require('../perfiles.service');

const conexiones = [
  { id: '1', nombre: 'Ana Pérez' },
  { id: '2', nombre: 'Luis Gómez' },
  { id: '3', nombre: 'Luis Gomez' },
];

describe('resolverPerfiles', () => {
  it('resuelve por conexionId cuando viene', () => {
    const { filas, resueltos } = resolverPerfiles({
      perfiles: [{ conexionId: 1, cargoActual: 'CTO' }],
      conexiones,
    });

    expect(resueltos).toEqual([{ conexionId: '1', nombre: 'Ana Pérez' }]);
    expect(filas[0]).toMatchObject({ conexion_id: 1, cargo_actual: 'CTO' });
  });

  it('resuelve por nombre ignorando tildes y espacios de más', () => {
    const { filas } = resolverPerfiles({
      perfiles: [{ nombre: '  ana  perez ', descripcion: 'Hola' }],
      conexiones,
    });

    expect(filas[0].conexion_id).toBe(1);
  });

  it('no elige entre homónimos: los reporta', () => {
    const { filas, ambiguos } = resolverPerfiles({
      perfiles: [{ nombre: 'Luis Gómez', sector: 'Fintech' }],
      conexiones,
    });

    expect(filas).toHaveLength(0);
    expect(ambiguos).toEqual([{ nombre: 'Luis Gómez', candidatas: ['2', '3'] }]);
  });

  it('devuelve los que no están en la red en vez de descartarlos en silencio', () => {
    const { filas, sinResolver } = resolverPerfiles({
      perfiles: [{ nombre: 'Persona Que No Existe' }, { nombre: 'Ana Pérez' }],
      conexiones,
    });

    expect(filas).toHaveLength(1);
    expect(sinResolver).toEqual(['Persona Que No Existe']);
  });

  it('mapea a snake_case y deja en null lo que el scraper no trajo', () => {
    const { filas } = resolverPerfiles({
      perfiles: [
        {
          nombre: 'Ana Pérez',
          empresaActual: 'Acme',
          enComun: { conexionesMutuas: 3 },
          publicaciones: [{ texto: 'algo' }],
        },
      ],
      conexiones,
    });

    expect(filas[0]).toEqual({
      conexion_id: 1,
      descripcion: null,
      cargo_actual: null,
      empresa_actual: 'Acme',
      sector: null,
      ubicacion: null,
      experiencia: null,
      educacion: null,
      publicaciones: [{ texto: 'algo' }],
      en_comun: { conexionesMutuas: 3 },
      seguidores: null,
      fuente: null,
    });
  });
});

describe('normalizarNombre', () => {
  it('deja comparables las variantes que devuelve un scraper', () => {
    expect(normalizarNombre('Bryan  Riaño')).toBe(normalizarNombre('bryan riano'));
    expect(normalizarNombre('Ana Pérez, MBA')).toBe('ana perez mba');
  });
});
