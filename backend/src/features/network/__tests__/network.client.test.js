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
const mockListItems = jest.fn();
const mockDataset = jest.fn(() => ({ listItems: mockListItems }));

jest.mock('apify-client', () => ({
  ApifyClient: jest.fn(() => ({ actor: mockActor, dataset: mockDataset })),
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

describe('relectura de un dataset ya pagado', () => {
  it('lee las filas con el token del backend y se las pasa al actor', async () => {
    // Un actor corre bajo LIMITED_PERMISSIONS: solo ve sus propios storages,
    // asi que leer un dataset ajeno desde adentro da 403 siempre. El backend
    // si tiene el token de cuenta, por eso la relectura vive aca.
    mockListItems.mockResolvedValue({ items: [{ type: 'reaction', actor: { id: 'A' } }] });

    await client.startExtraction({
      profileUrl: 'https://linkedin.com/in/nico',
      engagementDatasetId: 'z03VEKwaEyZo3JfGx',
    });

    expect(mockDataset).toHaveBeenCalledWith('z03VEKwaEyZo3JfGx');
    const input = mockStart.mock.calls[0][0];
    expect(input.engagement).toEqual([{ type: 'reaction', actor: { id: 'A' } }]);
    expect(input.engagementDatasetId).toBeUndefined();
  });

  it('no exige sesion: releer no scrapea nada', async () => {
    mockListItems.mockResolvedValue({ items: [{ type: 'reaction', actor: { id: 'A' } }] });

    await expect(
      client.startExtraction({
        profileUrl: 'https://linkedin.com/in/nico',
        engagementDatasetId: 'z03VEKwaEyZo3JfGx',
      }),
    ).resolves.toMatchObject({ runId: 'run-1' });
  });

  it('un dataset vacio o vencido lo dice, no arranca una corrida muda', async () => {
    // El plan FREE retiene datasets 7 dias. Pasado eso el id sigue siendo
    // valido pero no devuelve nada, y una corrida sin filas termina en un
    // error del actor tres minutos despues, ya cobrada.
    mockListItems.mockResolvedValue({ items: [] });

    await expect(
      client.startExtraction({
        profileUrl: 'https://linkedin.com/in/nico',
        engagementDatasetId: 'vencido',
      }),
    ).rejects.toThrow(/vacío|vencido|sin filas/i);

    expect(mockStart).not.toHaveBeenCalled();
  });
});
