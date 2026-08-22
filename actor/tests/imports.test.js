const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/**
 * Todo lo que main.js desestructura de un modulo local tiene que existir ahi.
 *
 * `node --check` no ve esta clase de error porque la sintaxis es valida: el
 * nombre queda `undefined` y explota recien cuando se lo llama — o sea en la
 * corrida real, despues de que el scraper ya cobro. Paso exactamente eso con
 * `loteNuevos`.
 */
test('main.js no importa nada que el modulo no exporte', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const requires = [...src.matchAll(/const \{([^}]+)\} = require\('(\.[^']+)'\)/g)];

  assert.ok(requires.length > 0, 'no se encontro ningun require desestructurado');

  for (const [, nombres, ruta] of requires) {
    const modulo = require(path.join(__dirname, '..', 'src', ruta.replace(/^\.\//, '')));
    for (const nombre of nombres.split(',').map((n) => n.trim()).filter(Boolean)) {
      assert.equal(
        typeof modulo[nombre],
        'function',
        `main.js importa ${nombre} de ${ruta}, pero ese modulo no lo exporta`,
      );
    }
  }
});

const { nombreDataset } = require('../src/engagement');

/**
 * Los datasets con nombre son GLOBALES a la cuenta de Apify.
 *
 * `Actor.openDataset('posts')` no crea uno por corrida: crea UNO y todas las
 * corridas le escriben encima. Asi habia 137 publicaciones de perfiles
 * distintos mezcladas en `Linkedintaka/posts`, mientras el backend buscaba
 * `<actorId>-<runId>-posts` — que no existia, y getOrCreate lo creaba vacio.
 * Resultado: el backend nunca leyo una publicacion y nadie se dio cuenta.
 *
 * Es el mismo bug de datos sin dueño que ya se arreglo en las conexiones.
 */
test('el nombre del dataset incluye la corrida, para no mezclar perfiles', () => {
  const a = nombreDataset('act1', 'run1', 'posts');
  const b = nombreDataset('act1', 'run2', 'posts');

  assert.notEqual(a, b);
  assert.match(a, /run1/);
});

test('coincide con el formato que el backend busca', () => {
  // El backend arma `${run.actId}-${run.id}-${sufijo}`. Si los dos lados no
  // usan exactamente el mismo formato, el dato se escribe en un lugar y se lee
  // de otro, sin error: solo silencio.
  assert.equal(nombreDataset('act1', 'run1', 'progreso'), 'act1-run1-progreso');
});

test('sin datos de la corrida no inventa un nombre global', () => {
  // Devolver 'posts' aca reintroduciria el bug: mejor null y que el llamador
  // decida, que escribir en el dataset compartido de todos los perfiles.
  assert.equal(nombreDataset(null, 'run1', 'posts'), null);
  assert.equal(nombreDataset('act1', undefined, 'posts'), null);
});
