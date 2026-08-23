const { INSTRUCCIONES_JUDGE } = require('../panel.llm-client');

describe('instrucciones del juez', () => {
  it('hace alcanzable un score funcional sin exigir un copy extraordinario', () => {
    expect(INSTRUCCIONES_JUDGE).toContain(
      'Un copy claro, creíble y relevante para vos ya arranca alrededor de 55',
    );
    expect(INSTRUCCIONES_JUDGE).toContain(
      'no tiene que ser una obra\nmaestra ni enseñarte algo revolucionario para funcionar',
    );
  });

  it('prioriza like sobre comentar y comentar sobre compartir', () => {
    expect(INSTRUCCIONES_JUDGE).toContain(
      'Orden natural de frecuencia: like primero, comentar después y compartir al final',
    );
    expect(INSTRUCCIONES_JUDGE).toContain(
      'la gran mayoría da like; algunos comentan; muy pocos comparten',
    );
    expect(INSTRUCCIONES_JUDGE).toContain(
      'like antes que comentar y comentar antes que\ncompartir',
    );
    expect(INSTRUCCIONES_JUDGE).toContain(
      'nivel 1 es like; nivel 2 es comentar y también dar like',
    );
    expect(INSTRUCCIONES_JUDGE).toContain(
      'nivel 3 es compartir, comentar y dar like',
    );
  });
});
