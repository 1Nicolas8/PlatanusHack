const { normalizeConnectionUrl, naturalKey } = require('../network.repository');

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
