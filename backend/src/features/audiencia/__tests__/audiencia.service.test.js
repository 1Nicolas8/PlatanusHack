jest.mock('../audiencia.repository');

const { loadAudienceData } = require('../audiencia.repository');
const { getResumen } = require('../audiencia.service');

const baseData = {
  connections: [
    { id: '1', nombre: 'Mariana C.', headline: 'Head of Growth', fechaContacto: '2026-01-01', arquetipoId: 'a1' },
    { id: '2', nombre: 'Julián F.', headline: 'Founder', fechaContacto: '2026-01-01', arquetipoId: 'a2' },
  ],
  archetypes: [
    { id: 'a1', nombre: 'Decisor SaaS' },
    { id: 'a2', nombre: 'Founder Fintech' },
  ],
  posts: [
    { id: 'p1', ordenCronologico: 1, fecha: null },
    { id: 'p2', ordenCronologico: 2, fecha: null },
  ],
  reactions: [
    { conexionId: '1', postId: 'p2', tipo: 'comentario', textoComentario: 'Muy útil esto.' },
    { conexionId: '1', postId: 'p1', tipo: 'like', textoComentario: null },
    { conexionId: '2', postId: 'p1', tipo: 'like', textoComentario: null },
  ],
};

describe('audiencia.service getResumen', () => {
  beforeEach(() => {
    loadAudienceData.mockResolvedValue(baseData);
  });

  it('arma el resumen con nombres de arquetipo y comentario real por contacto', async () => {
    const result = await getResumen({ perfilUrl: 'linkedin.com/in/bryan', limit: 6 });

    expect(result.totalContacts).toBe(2);
    expect(result.totalArchetypes).toBe(2);

    const mariana = result.topContacts.find((c) => c.nombre === 'Mariana C.');
    expect(mariana.arquetipo).toBe('Decisor SaaS');
    expect(mariana.sampleComment).toBe('Muy útil esto.');
    expect(mariana.fotoUrl).toBeNull();
    expect(result.ownerFotoUrl).toBeNull();
    expect(loadAudienceData).toHaveBeenCalledWith({
      perfilUrl: 'linkedin.com/in/bryan',
      supabase: undefined,
    });
  });

  it('un contacto sin comentario devuelve sampleComment null', async () => {
    const result = await getResumen({ perfilUrl: 'linkedin.com/in/bryan', limit: 6 });

    const julian = result.topContacts.find((c) => c.nombre === 'Julián F.');
    expect(julian.sampleComment).toBeNull();
  });

  it('respeta el límite pedido', async () => {
    const result = await getResumen({ perfilUrl: 'linkedin.com/in/bryan', limit: 1 });
    expect(result.topContacts).toHaveLength(1);
  });

  it('propaga las fotos del dueño y de cada contacto', async () => {
    loadAudienceData.mockResolvedValue({
      ...baseData,
      ownerFotoUrl: 'https://img.example/yo.jpg',
      connections: [
        { ...baseData.connections[0], fotoUrl: 'https://img.example/mariana.jpg' },
        baseData.connections[1],
      ],
    });

    const result = await getResumen({ perfilUrl: 'linkedin.com/in/bryan' });

    expect(result.ownerFotoUrl).toBe('https://img.example/yo.jpg');
    expect(result.topContacts.find((c) => c.nombre === 'Mariana C.').fotoUrl).toBe(
      'https://img.example/mariana.jpg',
    );
    expect(result.topContacts.find((c) => c.nombre === 'Julián F.').fotoUrl).toBeNull();
  });

  it('promedia likes y comentarios solo sobre posts con métrica', async () => {
    loadAudienceData.mockResolvedValue({
      ...baseData,
      posts: [
        { id: 'p1', ordenCronologico: 1, fecha: null, reacciones: 67, comentarios: 5 },
        { id: 'p2', ordenCronologico: 2, fecha: null, reacciones: 14, comentarios: 0 },
        { id: 'p3', ordenCronologico: 3, fecha: null },
      ],
    });

    const result = await getResumen({ perfilUrl: 'linkedin.com/in/bryan' });

    expect(result.postsConMetrica).toBe(2);
    expect(result.promedioReacciones).toBe(40.5);
    expect(result.promedioComentarios).toBe(2.5);
  });
});
