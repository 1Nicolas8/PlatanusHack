/**
 * Corre tareas en paralelo con un techo de concurrencia.
 *
 * Una evaluación de panel dispara panel × rondas × iteraciones llamadas al
 * modelo. Soltarlas todas juntas es la forma más rápida de comerse un 429 y
 * perder la corrida entera; hacerlas en serie tarda minutos. El techo es el
 * punto medio.
 */
async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);

  return results;
}

module.exports = { mapWithConcurrency };
