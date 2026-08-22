const {
  parseOptions,
  runId,
  calculatePostExposure,
  buildCalibration,
  loadInputs,
} = require('../calibrar-agentes');

const OPTIONS = { esquema: 'temporal', pctEnRed: 40, k: 5, alcanceHabilitado: true };

describe('calibración de agentes', () => {
  test('interpreta configuración y genera un id determinista', () => {
    const options = parseOptions(['--k', '8', '--pct-en-red', '35', '--sin-alcance'], {});
    expect(options).toEqual({ esquema: 'temporal', pctEnRed: 35, k: 8, alcanceHabilitado: false });
    expect(runId(options)).toBe(runId(options));
    expect(() => parseOptions(['--k', '0'], {})).toThrow('K fuera de rango');
  });

  test('usa el porcentaje medido y el supuesto configurable', () => {
    expect(calculatePostExposure({ id: 1, impresiones: 602, pct_en_red: 40 }, OPTIONS, 406)).toMatchObject({
      exposureProb: 240.8 / 406,
      impresionesEnRed: 240.8,
      fuenteAlcance: 'pct_en_red_medido',
    });
    expect(calculatePostExposure({ id: 2, impresiones: 100, pct_en_red: null }, OPTIONS, 406)).toMatchObject({
      exposureProb: 40 / 406,
      fuenteAlcance: 'pct_en_red_imputado',
    });
  });

  test('pondera solo fallos y cambia al apagar el alcance', () => {
    const agents = [
      { id: 1, conexion_id: 11, arquetipo_id: 7 },
      { id: 2, conexion_id: 12, arquetipo_id: 7 },
    ];
    const posts = [
      { id: 20, impresiones: 100, pct_en_red: 40 },
      { id: 21, impresiones: 1, pct_en_red: null },
    ];
    const reactions = [{ conexion_id: 11, post_id: 20 }, { conexion_id: 11, post_id: 20 }];
    const enabled = buildCalibration(agents, posts, reactions, OPTIONS);
    const disabled = buildCalibration(agents, posts, reactions, { ...OPTIONS, alcanceHabilitado: false });

    expect(enabled.calibrations[0].exitos).toBe(1);
    expect(enabled.calibrations[0].fallos_ponderados).toBeCloseTo(0.2);
    expect(enabled.calibrations[1].fallos_ponderados).toBeCloseTo(1.2);
    expect(enabled.calibrations[0].tasa_calibrada).not.toBe(disabled.calibrations[0].tasa_calibrada);
    expect(enabled.calibrations.every(({ tasa_calibrada: rate }) => rate >= 0 && rate <= 1)).toBe(true);
  });

  test('el repositorio carga únicamente ids con rol calibración', async () => {
    const calls = [];
    const responses = [
      [{ post_id: 1, rol: 'calibracion' }, { post_id: 2, rol: 'evaluacion' }],
      Array.from({ length: 406 }, (_, index) => ({ id: index + 1, conexion_id: index + 1, arquetipo_id: 1, nivel: 'prior' })),
      [{ id: 1, orden_cronologico: 1, impresiones: 100, pct_en_red: 40 }],
      [{ post_id: 1, conexion_id: 1 }],
      [{ id: 1, nombre: 'Arquetipo' }],
    ];
    const supabase = {
      from(table) {
        const state = { table };
        const query = {
          select() { return query; }, eq() { return query; }, order() { calls.push(state); return Promise.resolve({ data: responses.shift(), error: null }); },
          in(column, values) { state.in = { column, values }; if (table === 'reacciones') return query; return query; },
          not() { calls.push(state); return Promise.resolve({ data: responses.shift(), error: null }); },
          then(resolve) { calls.push(state); return Promise.resolve({ data: responses.shift(), error: null }).then(resolve); },
        };
        return query;
      },
    };

    await loadInputs(supabase, 'temporal');
    expect(calls.filter(({ in: filter }) => filter).map(({ in: filter }) => filter.values)).toEqual([[1], [1]]);
  });
});
