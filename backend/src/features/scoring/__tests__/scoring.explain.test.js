const { explainComparison, computeDrivers } = require('../scoring.explain');

const archetypes = [
  { id: '1', label: 'Founders' },
  { id: '2', label: 'Legal' },
];

// 90 founders, 10 de legal: el peso poblacional es 9 a 1.
const agents = [
  ...Array.from({ length: 90 }, (_, i) => ({ id: `f${i}`, archetypeId: '1' })),
  ...Array.from({ length: 10 }, (_, i) => ({ id: `l${i}`, archetypeId: '2' })),
];

const score = (archetypeId, commercialIntent, reasoning) => ({
  archetypeId,
  socialEngagement: 50,
  commercialIntent,
  reasoning,
});

describe('computeDrivers', () => {
  it('pondera por poblacion: un arquetipo grande explica mas que uno chico', () => {
    const drivers = computeDrivers({
      // Legal cambia el doble, pero es 9 veces mas chico.
      scoresA: [score('1', 80, 'a1'), score('2', 90, 'a2')],
      scoresB: [score('1', 60, 'b1'), score('2', 50, 'b2')],
      agents,
      archetypes,
    });

    expect(drivers[0].label).toBe('Founders');
    expect(drivers[0].contribution).toBeGreaterThan(drivers[1].contribution);
  });

  it('conserva el reasoning de ambas variantes', () => {
    const drivers = computeDrivers({
      scoresA: [score('1', 80, 'A dice esto')],
      scoresB: [score('1', 60, 'B dice esto otro')],
      agents,
      archetypes,
    });

    expect(drivers[0].reasoningA).toBe('A dice esto');
    expect(drivers[0].reasoningB).toBe('B dice esto otro');
  });

  it('ignora arquetipos que solo una variante puntuó', () => {
    const drivers = computeDrivers({
      scoresA: [score('1', 80, 'a'), score('2', 70, 'a2')],
      scoresB: [score('1', 60, 'b')],
      agents,
      archetypes,
    });

    expect(drivers).toHaveLength(1);
  });
});

describe('explainComparison', () => {
  const scoresA = [score('1', 85, 'A cita un caso con números'), score('2', 40, 'A no le habla a Legal')];
  const scoresB = [score('1', 50, 'B promete sin evidencia'), score('2', 60, 'B menciona compliance')];

  const comparison = { winner: 'A', deltaCommercialIntent: 6.3, verdict: 'Gana A' };

  it('cita arquetipos concretos con su peso poblacional', () => {
    const result = explainComparison({ comparison, scoresA, scoresB, agents, archetypes });

    expect(result.drivers[0].label).toBe('Founders');
    expect(result.drivers[0].population).toBe(90);
    expect(result.drivers[0].sharePct).toBe(90);
  });

  it('la evidencia sale del reasoning guardado, no de una opinión nueva', () => {
    const result = explainComparison({ comparison, scoresA, scoresB, agents, archetypes });

    expect(result.whatWorked[0].evidence).toBe('A cita un caso con números');
  });

  it('dice qué falla en la perdedora, no solo qué funciona en la ganadora', () => {
    const result = explainComparison({ comparison, scoresA, scoresB, agents, archetypes });

    expect(result.whatFailed[0].evidence).toBe('B promete sin evidencia');
    expect(result.whatFailed[0].gap).toBe(35);
  });

  it('muestra el tradeoff: dónde la perdedora era mejor', () => {
    const result = explainComparison({ comparison, scoresA, scoresB, agents, archetypes });

    expect(result.tradeoff[0].archetype).toBe('Legal');
    expect(result.tradeoff[0].gap).toBe(20);
  });

  it('avisa cuando ningún arquetipo domina el resultado', () => {
    const flatA = [score('1', 60, 'a1'), score('2', 60, 'a2')];
    const flatB = [score('1', 55, 'b1'), score('2', 20, 'b2')];

    const result = explainComparison({ comparison, scoresA: flatA, scoresB: flatB, agents, archetypes });

    expect(result.coverage.explainedShare).toBeGreaterThan(0);
    expect(result.coverage.note).toBeTruthy();
  });

  it('sin ganador no inventa una explicación', () => {
    const result = explainComparison({
      comparison: { winner: null, verdict: 'dentro del ruido' },
      scoresA,
      scoresB,
      agents,
      archetypes,
    });

    expect(result.drivers).toHaveLength(0);
    expect(result.note).toMatch(/seria inventar/i);
  });
});
