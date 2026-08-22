jest.mock('../../src/features/audiencia/audiencia.service');

const request = require('supertest');
const createApp = require('../../src/app');
const audienciaService = require('../../src/features/audiencia/audiencia.service');

describe('GET /api/audiencia/resumen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('responde 200 con el resumen del service', async () => {
    audienciaService.getResumen.mockResolvedValue({ totalContacts: 5, topContacts: [] });

    const response = await request(createApp())
      .get('/api/audiencia/resumen?perfil=https://linkedin.com/in/bryan');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { totalContacts: 5, topContacts: [] } });
    expect(audienciaService.getResumen).toHaveBeenCalledWith({
      perfilUrl: 'linkedin.com/in/bryan',
      limit: 6,
    });
  });

  it('rechaza un limit fuera de rango con 400', async () => {
    const response = await request(createApp())
      .get('/api/audiencia/resumen?perfil=https://linkedin.com/in/bryan&limit=100');

    expect(response.status).toBe(400);
  });
});
