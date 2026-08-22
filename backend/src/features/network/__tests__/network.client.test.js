/**
 * El contrato que importa acá: hay dos formas de traer una red y solo una
 * necesita sesión de LinkedIn.
 *
 *   profileUrl solo   → hace falta un scraper con cookie
 *   connections/CSV   → dato propio del usuario, no se scrapea nada
 *
 * El guard existe para no quemar corridas pagas condenadas a fallar. Pero no
 * puede bloquear el camino que no depende de Apify para nada.
 */

const mockStart = jest.fn();
const mockActor = jest.fn(() => ({ start: mockStart }));

jest.mock('apify-client', () => ({
  ApifyClient: jest.fn(() => ({ actor: mockActor })),
}));

jest.mock('../../../config/env', () => ({
  APIFY_TOKEN: 'token',
  APIFY_ACTOR_ID: 'orquestador',
  APIFY_CONNECTIONS_ACTOR_ID: 'scraper-con-cookie',
  APIFY_CONNECTIONS_ACTOR_INPUT: '',
  ANTHROPIC_API_KEY: 'anthropic',
}));

const client = require('../network.client');

beforeEach(() => {
  jest.clearAllMocks();
  mockStart.mockResolvedValue({ id: 'run-1', status: 'RUNNING', startedAt: '2026-08-22T10:00:00Z' });
});

const conexiones = [
  { 'First Name': 'Ana', 'Last Name': 'Perez', Company: 'Acme', Position: 'CTO' },
];

describe('conexiones ya cargadas', () => {
  it('arranca sin credenciales de sesión', async () => {
    await expect(
      client.startExtraction({ profileUrl: 'https://linkedin.com/in/nico', connections: conexiones }),
    ).resolves.toMatchObject({ runId: 'run-1' });
  });

  it('le pasa las filas al actor y no encadena el scraper', async () => {
    await client.startExtraction({ profileUrl: 'https://linkedin.com/in/nico', connections: conexiones });

    const input = mockStart.mock.calls[0][0];
    expect(input.connections).toEqual(conexiones);
    expect(input.connectionsActorId).toBeUndefined();
  });

  it('un CSV publicado también alcanza', async () => {
    await expect(
      client.startExtraction({
        profileUrl: 'https://linkedin.com/in/nico',
        connectionsUrl: 'https://archivos/Connections.csv',
      }),
    ).resolves.toMatchObject({ runId: 'run-1' });

    expect(mockStart.mock.calls[0][0].connectionsUrl).toBe('https://archivos/Connections.csv');
  });
});

describe('solo el enlace del perfil', () => {
  it('sigue exigiendo la sesión antes de gastar una corrida', async () => {
    await expect(
      client.startExtraction({ profileUrl: 'https://linkedin.com/in/nico' }),
    ).rejects.toThrow(/sin credenciales/i);

    expect(mockStart).not.toHaveBeenCalled();
  });

  it('una lista vacía no cuenta como red cargada', async () => {
    await expect(
      client.startExtraction({ profileUrl: 'https://linkedin.com/in/nico', connections: [] }),
    ).rejects.toThrow(/sin credenciales/i);
  });
});

describe('engagement público', () => {
  it('con actor de engagement no hace falta ninguna sesión', async () => {
    await expect(
      client.startExtraction({
        profileUrl: 'https://linkedin.com/in/nico',
        engagementActorId: 'scraper-de-comentarios',
        postsActorId: 'scraper-de-posts',
      }),
    ).resolves.toMatchObject({ runId: 'run-1' });
  });

  it('no encadena el scraper con cookie si hay engagement', async () => {
    await client.startExtraction({
      profileUrl: 'https://linkedin.com/in/nico',
      engagementActorId: 'scraper-de-comentarios',
      postsActorId: 'scraper-de-posts',
    });

    const input = mockStart.mock.calls[0][0];
    expect(input.engagementActorId).toBe('scraper-de-comentarios');
    expect(input.connectionsActorId).toBeUndefined();
  });

  it('sin actor de posts no hay de dónde sacar engagement y lo dice', async () => {
    await expect(
      client.startExtraction({
        profileUrl: 'https://linkedin.com/in/nico',
        engagementActorId: 'scraper-de-comentarios',
      }),
    ).rejects.toThrow(/publicaciones/i);

    expect(mockStart).not.toHaveBeenCalled();
  });
});
