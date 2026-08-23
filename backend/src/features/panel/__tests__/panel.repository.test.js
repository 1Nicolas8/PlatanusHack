jest.mock('../../../config/supabase', () => ({ getSupabaseClient: jest.fn() }));

const { getSupabaseClient } = require('../../../config/supabase');
const { loadPanelCandidates } = require('../panel.repository');
const { buildPersona } = require('../panel.persona');

/**
 * Este test existe por el punto ciego clásico: la DB devuelve snake_case y el
 * panel consume camelCase. Si solo se testeara el service con objetos armados
 * a mano, un `cargo_actual` sin mapear pasaría verde y en producción el agente
 * opinaría sin saber en qué trabaja.
 */

function mockSupabase({ conexiones, reacciones }) {
  const from = jest.fn((tabla) => {
    if (tabla === 'audiencias_actor') {
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: async () => ({ data: { run_id: 'run-actual' }, error: null }),
              }),
            }),
          }),
        }),
      };
    }
    if (tabla === 'conexiones') {
      return {
        select: () => ({
          eq: () => ({ eq: async () => ({ data: conexiones, error: null }) }),
        }),
      };
    }
    return {
      select: () => ({
        eq: () => ({ not: async () => ({ data: reacciones, error: null }) }),
      }),
    };
  });
  getSupabaseClient.mockReturnValue({ from });
  return from;
}

const filaConexion = {
  id: 7,
  nombre: 'Ana Pérez',
  headline: 'CTO en Acme',
  fecha_contacto: '2024-03-01',
  perfiles_enriquecidos: {
    descripcion: 'Construyo equipos de datos',
    cargo_actual: 'CTO',
    empresa_actual: 'Acme',
    sector: 'SaaS',
    ubicacion: 'Bogotá',
    experiencia: [{ cargo: 'Lead', empresa: 'Previa', desde: '2018', hasta: '2022' }],
    educacion: [{ institucion: 'Uniandes', titulo: 'Ing. Sistemas', anio: 2014 }],
    publicaciones: [{ texto: 'Sobre contratar data engineers', tipo: 'post' }],
    en_comun: { instituciones: ['Uniandes'], conexionesMutuas: 12 },
    seguidores: 3400,
    conexiones: 500,
    foto_url: 'https://img.example/ana.jpg',
    linkedin_url: 'linkedin.com/in/ana',
    grado_grafo: 12,
    es_icp: false,
    confianza_icp: 0,
    razon_icp: 'sin ICP definido',
  },
};

describe('loadPanelCandidates', () => {
  it('mapea el perfil enriquecido a la forma que consume el panel', async () => {
    mockSupabase({ conexiones: [filaConexion], reacciones: [] });

    const [candidato] = await loadPanelCandidates('linkedin.com/in/bryan');

    expect(candidato).toMatchObject({
      id: '7',
      nombre: 'Ana Pérez',
      interacciones: 0,
      perfil: {
        cargoActual: 'CTO',
        empresaActual: 'Acme',
        enComun: { instituciones: ['Uniandes'], conexionesMutuas: 12 },
      },
    });
    // La ficha del agente tiene que incluir lo enriquecido, no solo el headline.
    const ficha = buildPersona(candidato).ficha;
    expect(ficha).toContain('CTO');
    expect(ficha).toContain('Uniandes');
    expect(ficha).toContain('contratar data engineers');
  });

  it('cuenta las interacciones previas y guarda los comentarios', async () => {
    mockSupabase({
      conexiones: [filaConexion],
      reacciones: [
        { conexion_id: 7, tipo: 'like', texto_comentario: null },
        { conexion_id: 7, tipo: 'comentario', texto_comentario: 'Muy de acuerdo' },
      ],
    });

    const [candidato] = await loadPanelCandidates('linkedin.com/in/bryan');

    expect(candidato.interacciones).toBe(2);
    expect(candidato.comentariosPrevios).toEqual(['Muy de acuerdo']);
    expect(buildPersona(candidato).estrato).toBe('nucleo');
  });

  it('la ficha nombra el post, la fecha y el gesto — no un conteo suelto', async () => {
    mockSupabase({
      conexiones: [filaConexion],
      reacciones: [{
        conexion_id: 7,
        tipo: 'like',
        subtipo: 'celebrate',
        texto_comentario: null,
        posts: {
          perfil_url: 'linkedin.com/in/bryan',
          texto: 'We won the first GTM Hackathon in LATAM.',
          fecha: '2026-05-31',
        },
      }],
    });

    const [candidato] = await loadPanelCandidates('linkedin.com/in/bryan');
    const ficha = buildPersona(candidato).ficha;

    expect(candidato.historialObservado[0]).toMatchObject({
      tipo: 'like',
      subtipo: 'celebrate',
      fecha: '2026-05-31',
    });
    expect(ficha).toContain('2026-05-31');
    expect(ficha).toContain('celebraste');
    expect(ficha).toContain('GTM Hackathon');
  });

  it('una conexión sin enriquecer entra igual, marcada como no enriquecida', async () => {
    mockSupabase({
      conexiones: [{
        id: 9,
        nombre: 'Luis',
        headline: 'Growth',
        fecha_contacto: null,
        perfiles_enriquecidos: {
          actor_run_id: 'run-actual',
          descripcion: null,
          cargo_actual: null,
          empresa_actual: null,
          sector: null,
          ubicacion: null,
          experiencia: null,
          educacion: null,
          publicaciones: null,
          en_comun: null,
          seguidores: null,
          conexiones: null,
          foto_url: null,
          linkedin_url: null,
          grado_grafo: null,
          es_icp: null,
          confianza_icp: null,
          razon_icp: null,
        },
      }],
      reacciones: [],
    });

    const [candidato] = await loadPanelCandidates('linkedin.com/in/bryan');

    expect(candidato.perfil).not.toBeNull();
    expect(buildPersona(candidato).enriquecido).toBe(false);
  });

  it('no consulta reacciones si el perfil no tiene conexiones', async () => {
    const from = mockSupabase({ conexiones: [], reacciones: [] });

    expect(await loadPanelCandidates('linkedin.com/in/nadie')).toEqual([]);
    expect(from).toHaveBeenCalledTimes(2);
  });
});
