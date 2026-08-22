const { recommendWhoToCultivate, angleFor } = require('../recommend.service');

const node = (id, o = {}) => ({
  id,
  nombre: `C${id}`,
  headline: o.headline ?? 'Founder at Acme',
  actionable: o.actionable ?? true,
  heat: { interactions: o.interactions ?? 0, ring: o.ring ?? 5 },
  reach: { score: o.reach ?? 40, amplification: o.amp ?? 0, signals: o.signals ?? ['fundador o C-level'], source: 'headline' },
  posts: o.posts ?? [],
});

describe('angleFor', () => {
  it('detecta el ángulo de acercamiento del headline', () => {
    expect(angleFor('Co-Founder at X')).toBe('construye algo propio');
    expect(angleFor('Podcast host')).toBe('produce contenido');
    expect(angleFor('Estudiante')).toBeNull();
  });
});

describe('recommendWhoToCultivate', () => {
  it('solo recomienda a los accionables', () => {
    const { recommendations } = recommendWhoToCultivate({
      nodes: [node(1), node(2, { actionable: false })],
    });

    expect(recommendations.map((r) => r.id)).toEqual([1]);
  });

  it('la razón cita números medidos, no adjetivos', () => {
    const { recommendations } = recommendWhoToCultivate({ nodes: [node(1, { amp: 4.2 })] });

    expect(recommendations[0].why.join(' ')).toMatch(/4\.2 exposiciones externas/);
  });

  it('cuando ya interactuó, el enganche cita el contenido concreto', () => {
    const { recommendations } = recommendWhoToCultivate({
      nodes: [node(1, { interactions: 2, posts: [{ id: 9, texto: 'mi post sobre X' }] })],
    });

    expect(recommendations[0].hook.type).toBe('contenido-previo');
    expect(recommendations[0].hook.detail).toMatch(/mi post sobre X/);
  });

  it('cuando nunca interactuó lo DICE en vez de inventar un enganche', () => {
    const { recommendations } = recommendWhoToCultivate({ nodes: [node(1)] });

    expect(recommendations[0].hook.type).toBe('sin-señal');
    expect(recommendations[0].hook.detail).toMatch(/no hay dato para personalizar/i);
  });

  it('descarta a quien no tiene ninguna señal medida', () => {
    const sinSenal = node(1, { headline: 'Estudiante', signals: [], amp: 0, interactions: 0 });

    const { recommendations, summary } = recommendWhoToCultivate({ nodes: [sinSenal] });

    expect(recommendations).toHaveLength(0);
    expect(summary.skippedNoSignal).toBe(1);
  });

  it('prioriza a quien ya interactuó por encima del mismo alcance sin interacción', () => {
    const { recommendations } = recommendWhoToCultivate({
      nodes: [node(1, { reach: 50 }), node(2, { reach: 50, interactions: 3 })],
    });

    expect(recommendations[0].id).toBe(2);
  });

  it('sin candidatos avisa en vez de devolver una lista vacía sin contexto', () => {
    const { summary } = recommendWhoToCultivate({ nodes: [] });

    expect(summary.note).toMatch(/no hay a quien recomendar/i);
  });
});
