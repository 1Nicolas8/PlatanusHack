/**
 * Generador pseudoaleatorio con semilla (mulberry32).
 *
 * `Math.random()` no acepta semilla, así que no sirve: dos corridas del mismo
 * experimento darían poblaciones distintas y no se podría reproducir un
 * resultado. Todo lo aleatorio del simulador pasa por acá.
 */

/** Convierte una semilla de texto en un entero de 32 bits (xfnv1a). */
function seedToInt(seed) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * @param {string} seed
 * @returns {{ next: () => number, int: (maxExclusive: number) => number,
 *             jitter: (spread: number) => number, pick: <T>(items: T[]) => T }}
 */
function createRng(seed) {
  let state = seedToInt(String(seed));

  /** Uniforme en [0, 1). */
  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    next,
    int: (maxExclusive) => Math.floor(next() * maxExclusive),
    /**
     * Desvío centrado en 0 dentro de ±spread, con forma triangular: los valores
     * cerca del centro son más probables que los extremos. Un uniforme haría que
     * un agente del borde del grupo fuera tan común como uno del centro, y eso
     * no es cómo se distribuye una población.
     */
    jitter: (spread) => (next() + next() - 1) * spread,
    pick: (items) => items[Math.floor(next() * items.length)],
  };
}

module.exports = { createRng, seedToInt };
