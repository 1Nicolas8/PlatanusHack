const { planEnrichment } = require('../enrichment.service');

const node = (id, { actionable = false, ring = 5, reach = 10 } = {}) => ({
  id,
  nombre: `C${id}`,
  headline: 'h',
  actionable,
  heat: { ring },
  reach: { score: reach },
});

const nodes = [
  ...Array.from({ length: 40 }, (_, i) => node(`a${i}`, { actionable: true, reach: 90 - i })),
  ...Array.from({ length: 20 }, (_, i) => node(`n${i}`, { ring: 1, reach: 70 - i })),
  ...Array.from({ length: 200 }, (_, i) => node(`r${i}`, { ring: 4, reach: 50 - i * 0.1 })),
];

describe('planEnrichment', () => {
  it('gasta el presupuesto y no lo excede', () => {
    expect(planEnrichment({ nodes, budget: 50 }).toEnrich).toHaveLength(50);
  });

  it('prioriza a los accionables: son la lista de trabajo', () => {
    const { byGroup } = planEnrichment({ nodes, budget: 50 });
    const accionable = byGroup.find((g) => g.group === 'accionable');

    expect(accionable.taken).toBeGreaterThanOrEqual(25);
  });

  it('dentro de cada grupo elige por alcance, no por orden de lista', () => {
    const { toEnrich } = planEnrichment({ nodes, budget: 10 });
    const scores = toEnrich.filter((n) => n.group === 'accionable').map((n) => n.reachScore);

    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it('no repite a quien ya fue enriquecido', () => {
    const { toEnrich } = planEnrichment({
      nodes,
      budget: 10,
      alreadyEnriched: ['a0', 'a1', 'a2'],
    });

    expect(toEnrich.map((n) => n.id)).not.toContain('a0');
  });

  it('si no hay accionables reparte el sobrante en vez de desperdiciarlo', () => {
    const sinAccionables = nodes.filter((n) => !n.actionable);

    expect(planEnrichment({ nodes: sinAccionables, budget: 40 }).toEnrich).toHaveLength(40);
  });

  it('con presupuesto cero no enriquece a nadie y lo dice', () => {
    const plan = planEnrichment({ nodes, budget: 0 });

    expect(plan.toEnrich).toHaveLength(0);
    expect(plan.note).toMatch(/nada que enriquecer/i);
  });

  it('reporta qué fracción de los accionables cubre', () => {
    const { coverage } = planEnrichment({ nodes, budget: 50 });

    expect(coverage.actionableTotal).toBe(40);
    expect(coverage.actionableCovered).toBeLessThanOrEqual(40);
  });
});
