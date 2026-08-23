const { normalizeConnectionUrl, naturalKey, matchPost } = require('../network.repository');

describe('identidad estable de conexiones del actor', () => {
  it('normaliza variantes de la misma URL de LinkedIn', () => {
    expect(normalizeConnectionUrl('https://www.linkedin.com/in/Ana-Perez/?trk=abc'))
      .toBe('linkedin.com/in/ana-perez');
    expect(normalizeConnectionUrl('linkedin.com/in/ana-perez'))
      .toBe('linkedin.com/in/ana-perez');
  });

  it('usa nombre y fecha solo como fallback cuando no hay URL', () => {
    expect(naturalKey({ name: 'Ana Pérez', connectedOn: '2026-08-22' }))
      .toBe(naturalKey({ nombre: 'ana pérez', fecha_contacto: '2026-08-22' }));
  });
});

describe('matchPost', () => {
  const stored = [
    { id: 1, texto: 'We won the first GTM Hackathon in LATAM. Four developers. One weekend.' },
    { id: 2, texto: 'Muy feliz de haber participado en este hackathon' },
  ];

  it('une el gancho del historial con el texto persistido', () => {
    expect(matchPost({ hook: 'We won the first GTM Hackathon in LATAM.' }, stored).id).toBe(1);
  });

  it('sin gancho no inventa un post', () => {
    expect(matchPost({ hook: null }, stored)).toBeNull();
  });
});

describe('identidad estable de conexiones del actor', () => {
  it('normaliza variantes de la misma URL de LinkedIn', () => {
    expect(normalizeConnectionUrl('https://www.linkedin.com/in/Ana-Perez/?trk=abc'))
      .toBe('linkedin.com/in/ana-perez');
    expect(normalizeConnectionUrl('linkedin.com/in/ana-perez'))
      .toBe('linkedin.com/in/ana-perez');
  });

  it('usa nombre y fecha solo como fallback cuando no hay URL', () => {
    expect(naturalKey({ name: 'Ana Pérez', connectedOn: '2026-08-22' }))
      .toBe(naturalKey({ nombre: 'ana pérez', fecha_contacto: '2026-08-22' }));
  });
});
