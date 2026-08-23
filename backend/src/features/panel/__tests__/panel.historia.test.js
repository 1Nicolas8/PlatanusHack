const { postYaPublicado, prepararMundo } = require('../panel.historia');
const { buildPanel } = require('../panel.persona');

const COPY =
  'Llevamos ocho meses cobrando por uso y la retención subió catorce puntos. Nadie nos avisó que el ' +
  'churn no era un problema de producto sino de cómo estábamos facturando, y tardamos un año en verlo.';

const posts = [
  { id: 'p1', texto: 'Una publicación anterior cualquiera, lo bastante larga como para no confundirse con ninguna otra y para superar con holgura el umbral de solape del detector.', ordenCronologico: 1, fecha: '2026-01-01' },
  { id: 'p2', texto: COPY, ordenCronologico: 2, fecha: '2026-02-01', totalReacciones: 31, interaccionesSociales: 4 },
];

const candidates = [{
  id: 'c1',
  nombre: 'Ana Pérez',
  headline: 'CTO',
  grado: 1,
  fechaContacto: '2025-01-01',
  interacciones: 1,
  reaccionesPorTipo: { like: 1 },
  comentariosPrevios: [],
  historialObservado: [
    { tipo: 'like', subtipo: 'celebrate', postId: 'p2', orden: 2, fecha: '2026-02-01', hook: COPY.slice(0, 140) },
  ],
  perfil: { cargoActual: 'CTO' },
}];

describe('postYaPublicado', () => {
  it('reconoce el copy aunque cambien saltos de línea y mayúsculas', () => {
    expect(postYaPublicado({ copy: `  ${COPY.toUpperCase().replace(/ /g, '\n')}  `, posts })?.id).toBe('p2');
  });

  it('reconoce el gancho recortado que guarda la ficha', () => {
    expect(postYaPublicado({ copy: COPY.slice(0, 140), posts })?.id).toBe('p2');
  });

  it('no confunde un copy nuevo con una publicación existente', () => {
    expect(postYaPublicado({ copy: 'Un copy completamente nuevo sobre otra cosa, largo como para pasar el umbral de solape mínimo.', posts })).toBeNull();
  });

  it('no marca como publicado un texto demasiado corto para distinguirse', () => {
    expect(postYaPublicado({ copy: 'Gracias a todos', posts })).toBeNull();
  });
});

describe('prepararMundo', () => {
  it('deja el mundo intacto cuando el copy es nuevo', () => {
    const mundo = prepararMundo({ copy: 'Copy inédito, suficientemente largo como para superar el mínimo de solape que exige el detector.', candidates, posts });
    expect(mundo.historia).toBeNull();
    expect(mundo.posts).toHaveLength(2);
  });

  it('saca de la ficha el post que se está evaluando: el agente no puede leer su propia respuesta', () => {
    const mundo = prepararMundo({ copy: COPY, candidates, posts });

    expect(mundo.historia.recortada).toBe(true);
    expect(mundo.historia.reaccionesReales).toBe(31);
    expect(mundo.historia.yaReaccionaron).toBe(1);
    expect(mundo.posts.map((p) => p.id)).toEqual(['p1']);

    const [ficha] = buildPanel({ candidates: mundo.candidates, posts: mundo.posts }).map((p) => p.ficha);
    expect(ficha).not.toContain(COPY.slice(0, 60));
    expect(ficha).toContain('Nunca reaccionaste a nada suyo');
  });

  it('se niega cuando el copy es la primera publicación: recortarlo dejaría a los agentes sin historia', () => {
    expect(() => prepararMundo({ copy: posts[0].texto, candidates, posts })).toThrow(/primera publicación/);
  });
});
