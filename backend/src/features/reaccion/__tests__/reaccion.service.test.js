jest.mock('../reaccion.repository');
jest.mock('../reaccion.llm-client');
jest.mock('../../audience/audience.real-population');

const {
  findLatestCalibrationRun, listArchetypes, listConnections, loadReactionHistory,
} = require('../reaccion.repository');
const { evaluateArchetypeReaction, generateIndividualComment } = require('../reaccion.llm-client');
const { loadRealPopulation } = require('../../audience/audience.real-population');
const { simulateReaction } = require('../reaccion.service');

const archetypes = [
  { id: 'a1', nombre: 'Founder', descripcion: 'Fundador B2B', awareness: 'problem-aware', objeciones: 'Pide evidencia', painPoints: 'Falta de foco', sensibilidadPrecio: 'alta', intencionCompra: 'media' },
  { id: 'a2', nombre: 'Marketing', descripcion: 'Líder de marketing', awareness: 'solution-aware', objeciones: 'Cuida el tiempo', painPoints: 'Bajo engagement', sensibilidadPrecio: 'media', intencionCompra: 'alta' },
];

const population = {
  size: 4,
  distribution: [
    { archetypeId: 'a1', archetypeLabel: 'Founder', count: 2 },
    { archetypeId: 'a2', archetypeLabel: 'Marketing', count: 2 },
  ],
  agents: [
    { id: '1', conexionId: 'c1', archetypeId: 'a1', archetypeLabel: 'Founder', tasaCalibrada: 1, nivel: 'calibrado', reaccionesObservadas: 3 },
    { id: '2', conexionId: 'c2', archetypeId: 'a1', archetypeLabel: 'Founder', tasaCalibrada: 1, nivel: 'prior', reaccionesObservadas: 1 },
    { id: '3', conexionId: 'c3', archetypeId: 'a2', archetypeLabel: 'Marketing', tasaCalibrada: 0, nivel: 'calibrado', reaccionesObservadas: 4 },
    { id: '4', conexionId: 'c4', archetypeId: 'a2', archetypeLabel: 'Marketing', tasaCalibrada: 0, nivel: 'prior', reaccionesObservadas: 0 },
  ],
};

describe('reaccion.service simulateReaction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    findLatestCalibrationRun.mockResolvedValue({ id: 'corrida-1' });
    listArchetypes.mockResolvedValue(archetypes);
    listConnections.mockResolvedValue([
      { id: 'c1', nombre: 'Ana Ruiz', headline: 'Founder' },
      { id: 'c2', nombre: 'Bruno Díaz', headline: 'CEO' },
      { id: 'c3', nombre: 'Carla Paz', headline: 'CMO' },
      { id: 'c4', nombre: 'Diego Sol', headline: 'Growth Lead' },
    ]);
    loadRealPopulation.mockResolvedValue(population);
    loadReactionHistory.mockResolvedValue(new Map([
      ['c1', [{ postId: 'p1', postTitulo: 'Post real', tipo: 'comentario', textoComentario: 'Muy útil.' }]],
      ['c2', []],
    ]));
    evaluateArchetypeReaction
      .mockResolvedValueOnce({ prompt: 'Prompt Founder completo', probLike: 1, probComentario: 0, probIgnorar: 0, comentarioEjemplo: 'Esto sí atiende mi problema.' })
      .mockResolvedValueOnce({ prompt: 'Prompt Marketing completo', probLike: 0, probComentario: 1, probIgnorar: 0, comentarioEjemplo: '¿Cómo lo medirían?' });
  });

  it('consulta una vez al LLM por arquetipo y muestrea las acciones con la tasa calibrada', async () => {
    const result = await simulateReaction({ copy: 'Un copy a probar' });

    expect(evaluateArchetypeReaction).toHaveBeenCalledTimes(2);
    expect(loadRealPopulation).toHaveBeenCalledWith({ corridaId: 'corrida-1', supabase: undefined });
    expect(result.porArquetipo).toEqual([
      { arquetipo: 'Founder', probLike: 1, probComentario: 0, probIgnorar: 0, comentarioEjemplo: 'Esto sí atiende mi problema.' },
      { arquetipo: 'Marketing', probLike: 0, probComentario: 1, probIgnorar: 0, comentarioEjemplo: '¿Cómo lo medirían?' },
    ]);
    expect(result.resumen).toEqual({ totalAgentesSimulados: 4, likes: 2, comentarios: 0, ignorados: 2 });
    expect(loadReactionHistory).toHaveBeenCalledWith({ connectionIds: ['c1', 'c2'], supabase: undefined });
    expect(result.reacciones.likes).toEqual([
      expect.objectContaining({ connectionId: 'c1', nombre: 'Ana Ruiz', headline: 'Founder', arquetipo: 'Founder' }),
      expect.objectContaining({ connectionId: 'c2', nombre: 'Bruno Díaz', headline: 'CEO', arquetipo: 'Founder' }),
    ]);
    expect(result.reacciones.likes[0].perfil).toEqual({
      arquetipo: archetypes[0],
      calibracion: { tasaCalibrada: 1, nivel: 'calibrado', reaccionesObservadas: 3 },
      historialReacciones: [{ postId: 'p1', postTitulo: 'Post real', tipo: 'comentario', textoComentario: 'Muy útil.' }],
      prompt: 'Prompt Founder completo',
      respuestaLLM: { probLike: 1, probComentario: 0, probIgnorar: 0, comentarioEjemplo: 'Esto sí atiende mi problema.' },
    });
    expect(generateIndividualComment).not.toHaveBeenCalled();
  });

  it('identifica a cada comentarista y genera un comentario individual por persona', async () => {
    evaluateArchetypeReaction
      .mockReset()
      .mockResolvedValueOnce({ prompt: 'Prompt Founder completo', probLike: 0, probComentario: 1, probIgnorar: 0, comentarioEjemplo: 'Comentario arquetípico.' })
      .mockResolvedValueOnce({ prompt: 'Prompt Marketing completo', probLike: 0, probComentario: 0, probIgnorar: 1, comentarioEjemplo: 'No comenta.' });
    generateIndividualComment
      .mockResolvedValueOnce({ prompt: 'Prompt individual Ana completo', comentario: '¿Cómo cambia esto la priorización del equipo?' })
      .mockResolvedValueOnce({ prompt: 'Prompt individual Bruno completo', comentario: 'Me interesa probarlo en nuestro próximo lanzamiento.' });

    const result = await simulateReaction({ copy: 'Un copy a probar' });

    expect(generateIndividualComment).toHaveBeenCalledTimes(2);
    expect(generateIndividualComment).toHaveBeenCalledWith(expect.objectContaining({
      nombre: 'Ana Ruiz', headline: 'Founder', archetype: archetypes[0],
    }));
    expect(result.reacciones.comentarios).toEqual([
      expect.objectContaining({
        connectionId: 'c1', nombre: 'Ana Ruiz', headline: 'Founder', arquetipo: 'Founder',
        comentario: '¿Cómo cambia esto la priorización del equipo?',
        perfil: expect.objectContaining({
          arquetipo: archetypes[0],
          calibracion: { tasaCalibrada: 1, nivel: 'calibrado', reaccionesObservadas: 3 },
          historialReacciones: [{ postId: 'p1', postTitulo: 'Post real', tipo: 'comentario', textoComentario: 'Muy útil.' }],
          prompt: 'Prompt individual Ana completo',
          respuestaLLM: '¿Cómo cambia esto la priorización del equipo?',
        }),
      }),
      expect.objectContaining({
        connectionId: 'c2', nombre: 'Bruno Díaz', headline: 'CEO', arquetipo: 'Founder',
        comentario: 'Me interesa probarlo en nuestro próximo lanzamiento.',
        perfil: expect.objectContaining({ prompt: 'Prompt individual Bruno completo' }),
      }),
    ]);
  });

  it('usa la corrida entregada sin consultar la más reciente', async () => {
    await simulateReaction({ copy: 'Un copy a probar', corridaId: 'corrida-elegida' });

    expect(findLatestCalibrationRun).not.toHaveBeenCalled();
    expect(loadRealPopulation).toHaveBeenCalledWith({ corridaId: 'corrida-elegida', supabase: undefined });
  });

  it('falla claramente cuando no existe una corrida calibrada', async () => {
    findLatestCalibrationRun.mockResolvedValue(null);

    await expect(simulateReaction({ copy: 'Un copy a probar' }))
      .rejects
      .toMatchObject({ statusCode: 409 });
    expect(evaluateArchetypeReaction).not.toHaveBeenCalled();
  });
});
