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
  /**
   * Los textos nunca vuelven iguales a como se pegaron. El scraper corta donde
   * LinkedIn pone el "ver más", el editor mete comillas curvas, el autor le
   * agrega un emoji. Comparar substrings exactas fallaba en todos esos casos —
   * y fallar significa no rebobinar, o sea dejar la fuga puesta.
   */
  const mismoPost = {
    'idéntico': (t) => t,
    'con los saltos de línea cambiados': (t) => t.replace(/ /g, '\n'),
    'truncado por el scraper': (t) => `${t.slice(0, 150)}…`,
    'con un emoji agregado en el medio': (t) => t.replace('retención', '📈 retención'),
    'con hashtags al final': (t) => `${t}\n\n#saas #pricing`,
    'con comillas curvas': (t) => t.replace('churn', '\u2018churn\u2019'),
    'con espacios no separables': (t) => t.replace(/ /g, '\u00a0'),
    'con una palabra editada en el medio': (t) => t.replace('catorce', 'quince'),
    'en mayúsculas': (t) => t.toUpperCase(),
  };

  for (const [caso, mutar] of Object.entries(mismoPost)) {
    it(`lo reconoce ${caso}`, () => {
      expect(postYaPublicado({ copy: mutar(COPY), posts })?.id).toBe('p2');
    });
  }

  it('no confunde un copy nuevo del mismo tema con una publicación existente', () => {
    const nuevo =
      'Estuvimos ocho meses probando modelos de precio y ninguno movió la aguja hasta que dejamos de ' +
      'cobrar por asiento y empezamos a cobrar por resultado entregado al cliente final.';
    expect(postYaPublicado({ copy: nuevo, posts })).toBeNull();
  });

  it('no marca como publicado un texto demasiado corto para distinguirse', () => {
    expect(postYaPublicado({ copy: 'Gracias a todos', posts })).toBeNull();
  });

  it('distingue entre dos publicaciones del mismo perfil', () => {
    expect(postYaPublicado({ copy: posts[0].texto, posts })?.id).toBe('p1');
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
