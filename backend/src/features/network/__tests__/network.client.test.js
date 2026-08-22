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

describe('el scraper con cookie, cuando se lo pide explicitamente', () => {
  // Antes este guard cubria el caso "solo llega un profileUrl", porque sin
  // fuente configurada la unica salida era el scraper con cookie. Ahora la
  // fuente publica es el default, asi que solo llega acá quien NOMBRA el
  // scraper con cookie. El guard sigue haciendo falta para lo mismo: no gastar
  // una corrida que va a morir en invalid-input y se cobra igual.
  it('sin credenciales, corta antes de gastar una corrida', async () => {
    await expect(
      client.startExtraction({
        profileUrl: 'https://linkedin.com/in/nico',
        connectionsActorId: 'scraper-con-cookie',
      }),
    ).rejects.toThrow(/sin credenciales/i);

    expect(mockStart).not.toHaveBeenCalled();
  });

  it('una lista vacía no cuenta como red cargada', async () => {
    await expect(
      client.startExtraction({
        profileUrl: 'https://linkedin.com/in/nico',
        connections: [],
        connectionsActorId: 'scraper-con-cookie',
      }),
    ).rejects.toThrow(/sin credenciales/i);
  });

  it('gana sobre el default publico: si lo nombraste, lo queres', async () => {
    await client.startExtraction({
      profileUrl: 'https://linkedin.com/in/nico',
      connectionsActorId: 'scraper-con-cookie',
      connectionsActorInput: { liAtCookie: 'x' },
    });

    const input = mockStart.mock.calls[0][0];
    expect(input.connectionsActorId).toBe('scraper-con-cookie');
    expect(input.engagementActorId).toBeUndefined();
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

describe('fuente publica por defecto', () => {
  it('sin configurar nada, usa el scraper sin cookie probado', async () => {
    // El backend no guarda credenciales ajenas, y por eso nunca eligio scraper.
    // Pero la fuente publica no TIENE credencial: no hay nada que guardar. Un
    // default que funciona sin configurar nada es la diferencia entre que el
    // producto ande al pegar una URL o que tire 400 hasta que alguien cargue
    // dos env vars. El env lo sigue pudiendo sobreescribir.
    await client.startExtraction({ profileUrl: 'https://linkedin.com/in/nico' });

    const input = mockStart.mock.calls[0][0];
    expect(input.engagementActorId).toBe('harvestapi/linkedin-profile-posts');
    expect(input.postsActorId).toBe('harvestapi/linkedin-profile-posts');
    expect(input.engagementActorInput).toMatchObject({
      scrapeComments: true,
      scrapeReactions: true,
    });
  });

  it('el default no encadena el scraper con cookie', async () => {
    await client.startExtraction({ profileUrl: 'https://linkedin.com/in/nico' });

    expect(mockStart.mock.calls[0][0].connectionsActorId).toBeUndefined();
  });
});

describe('nombre del campo del perfil', () => {
  it('declara targetUrls: adivinarlo devolvia cero filas en silencio', async () => {
    // El actor encadenado recibia `profileUrl`, harvestapi espera `targetUrls`.
    // Lo ignoraba, devolvia 0 posts y la corrida moria diciendo "no hay red que
    // analizar" — un error que apuntaba al lugar equivocado.
    await client.startExtraction({ profileUrl: 'https://linkedin.com/in/nico' });

    expect(mockStart.mock.calls[0][0].profileField).toBe('targetUrls');
  });
});

describe('un dataset que no existe', () => {
  it('responde 400 con el motivo, no 500', async () => {
    // En produccion esto daba "Internal server error": el cliente de Apify tira
    // un 404 propio, que no es AppError, y el errorHandler lo vuelve 500. El
    // usuario no puede hacer nada con eso; el motivo real si es accionable.
    mockListItems.mockRejectedValue(new Error('Dataset was not found'));

    await expect(
      client.startExtraction({
        profileUrl: 'https://linkedin.com/in/nico',
        engagementDatasetId: 'noexiste',
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(mockStart).not.toHaveBeenCalled();
  });
});

describe('datasets con nombre', () => {
  it('los pide con el prefijo de cuenta, no con el nombre pelado', async () => {
    // La API de Apify resuelve un store por nombre solo con `usuario~nombre`;
    // con el nombre pelado responde 404. El dataset de progreso existia con 35
    // filas y el backend devolvia 0 — y el catch se comia el 404 en silencio,
    // asi que parecia "todavia no hay nada" en vez de un bug.
    mockListItems.mockResolvedValue({ items: [{ nombre: 'Ana' }] });

    await client.fetchProgress({ actId: 'act1', id: 'run1' });

    expect(mockDataset).toHaveBeenCalledWith('~act1-run1-progreso');
  });

  it('las publicaciones usan el mismo prefijo', async () => {
    mockListItems.mockResolvedValue({ items: [] });

    await client.fetchPosts({ actId: 'act1', id: 'run1' });

    expect(mockDataset).toHaveBeenCalledWith('~act1-run1-posts');
  });
});
