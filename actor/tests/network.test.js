const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeProfile } = require('../src/network');

test('normaliza nombre y foto de la salida de un scraper de perfil', () => {
  assert.deepEqual(normalizeProfile({
    nombre: 'Ana Pérez',
    profilePictureUrl: 'https://img.test/ana.jpg',
  }), { nombre: 'Ana Pérez', fotoUrl: 'https://img.test/ana.jpg' });
});

test('no inventa un perfil cuando el scraper no devuelve campos reconocidos', () => {
  assert.equal(normalizeProfile({ id: 'unknown' }), null);
});
