const { normalizeProfileUrl } = require('../profileKey');

describe('normalizeProfileUrl', () => {
  it('colapsa las variantes del mismo perfil en una sola clave', () => {
    const expected = 'linkedin.com/in/juan-nicolas-torrente';

    for (const variant of [
      'https://www.linkedin.com/in/juan-nicolas-torrente/',
      'http://linkedin.com/in/Juan-Nicolas-Torrente',
      'linkedin.com/in/juan-nicolas-torrente?utm_source=share',
      '  https://www.linkedin.com/in/juan-nicolas-torrente  ',
    ]) {
      expect(normalizeProfileUrl(variant)).toBe(expected);
    }
  });

  it('no confunde dos perfiles distintos', () => {
    expect(normalizeProfileUrl('linkedin.com/in/ana')).not.toBe(
      normalizeProfileUrl('linkedin.com/in/ana-lopez'),
    );
  });

  it('rechaza lo que no es un perfil en vez de inventar una clave', () => {
    expect(() => normalizeProfileUrl('')).toThrow(/Falta la URL/);
    expect(() => normalizeProfileUrl('https://linkedin.com/company/acme')).toThrow(/perfil de LinkedIn/);
    expect(() => normalizeProfileUrl('no es una url')).toThrow();
  });
});
