jest.mock('../network.client');
jest.mock('../network.repository');
jest.mock('../../perfiles/perfiles.service');

const client = require('../network.client');
const repository = require('../network.repository');
const perfilesService = require('../../perfiles/perfiles.service');
const service = require('../network.service');

const run = (overrides = {}) => ({
  id: 'run-1',
  actId: 'act-1',
  status: 'SUCCEEDED',
  startedAt: '2026-08-22T10:00:00Z',
  finishedAt: '2026-08-22T10:04:00Z',
  defaultDatasetId: 'ds-1',
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  repository.saveConnections.mockResolvedValue({ written: 0, matches: [] });
  repository.savePosts.mockResolvedValue(0);
  repository.saveReactions.mockResolvedValue(0);
  perfilesService.ingestActorAudience.mockResolvedValue({ profilesWritten: 0, profilesMatched: 0 });
  client.fetchContacts.mockResolvedValue([]);
  client.fetchPosts.mockResolvedValue([]);
  client.fetchProgress.mockResolvedValue([]);
});

describe('startRun', () => {
  it('devuelve el runId sin esperar a que termine', async () => {
    client.startExtraction.mockResolvedValue({ runId: 'run-1', status: 'RUNNING' });

    await expect(service.startRun({ profileUrl: 'https://li/x', icp: 'founders' })).resolves.toEqual({
      runId: 'run-1',
      status: 'RUNNING',
    });
  });
});

describe('getRunStatus', () => {
  it('mientras corre no toca la base', async () => {
    client.getRun.mockResolvedValue(run({ status: 'RUNNING', finishedAt: null }));

    const result = await service.getRunStatus('run-1');

    expect(result.finished).toBe(false);
    expect(repository.saveConnections).not.toHaveBeenCalled();
  });

  it('una corrida fallida no persiste nada', async () => {
    client.getRun.mockResolvedValue(run({ status: 'FAILED' }));

    const result = await service.getRunStatus('run-1');

    expect(result.finished).toBe(true);
    expect(result.summary).toBeUndefined();
    expect(repository.savePosts).not.toHaveBeenCalled();
  });

  it('cuando termina bien persiste contactos y posts', async () => {
    client.getRun.mockResolvedValue(run());
    client.fetchContacts.mockResolvedValue([
      { name: 'Ana', isIcp: true },
      { name: 'Luis', isIcp: false },
    ]);
    client.fetchPosts.mockResolvedValue([{ text: 'hola' }]);
    client.fetchRunInput.mockResolvedValue({
      profileUrl: 'https://www.linkedin.com/in/Juan-Nicolas-Torrente/',
    });
    const matches = [{ connectionId: '1', contact: { name: 'Ana' } }];
    repository.saveConnections.mockResolvedValue({ written: 2, matches });
    repository.savePosts.mockResolvedValue(1);
    perfilesService.ingestActorAudience.mockResolvedValue({ profilesWritten: 1, profilesMatched: 1 });

    const result = await service.getRunStatus('run-1');

    expect(result.summary).toEqual({
      contacts: 2,
      posts: 1,
      icpContacts: 1,
      promedioReacciones: null,
      promedioComentarios: null,
      postsConMetrica: 0,
    });
    expect(result.written).toEqual({
      connections: 2,
      profiles: 1,
      profilesMatched: 1,
      posts: 1,
      reactions: 0,
    });
    expect(result.persisted).toBe(true);
    // Se escribe bajo la clave normalizada, no bajo la URL cruda: si no, cada
    // variante de la misma URL seria un dueño distinto.
    expect(result.perfilUrl).toBe('linkedin.com/in/juan-nicolas-torrente');
    expect(repository.saveConnections).toHaveBeenCalledWith(
      'linkedin.com/in/juan-nicolas-torrente',
      expect.any(Array),
    );
    expect(perfilesService.ingestActorAudience).toHaveBeenCalledWith(expect.objectContaining({
      perfilUrl: 'linkedin.com/in/juan-nicolas-torrente',
      runId: 'run-1',
      matches,
      ownerFotoUrl: null,
    }));
    expect(repository.saveReactions).toHaveBeenCalledWith(
      'linkedin.com/in/juan-nicolas-torrente',
      { matches },
    );
  });

  it('guarda la foto del dueño que viene como autor de los posts', async () => {
    client.getRun.mockResolvedValue(run());
    client.fetchContacts.mockResolvedValue([{ name: 'Ana' }]);
    client.fetchPosts.mockResolvedValue([
      {
        text: 'hola',
        // El autor tiene que identificarse: desde que se filtran los reposts,
        // una foto sin dueño reconocible ya no se toma — mostraba la cara de
        // otra persona cuando el post mas reciente era un repost.
        raw: {
          author: {
            publicIdentifier: 'yo',
            profilePictures: [{ url: 'https://media.licdn.com/me.jpg' }],
          },
        },
      },
    ]);
    client.fetchRunInput.mockResolvedValue({ profileUrl: 'https://linkedin.com/in/yo' });
    repository.saveConnections.mockResolvedValue({ written: 1, matches: [] });

    await service.getRunStatus('run-1');

    expect(perfilesService.ingestActorAudience).toHaveBeenCalledWith(
      expect.objectContaining({ ownerFotoUrl: 'https://media.licdn.com/me.jpg' }),
    );
  });

  it('sin perfil de origen no escribe nada: no se sabe de quien es la red', async () => {
    client.getRun.mockResolvedValue(run());
    client.fetchContacts.mockResolvedValue([{ name: 'Ana' }]);
    client.fetchPosts.mockResolvedValue([]);
  client.fetchProgress.mockResolvedValue([]);
    client.fetchRunInput.mockResolvedValue(null);

    await expect(service.getRunStatus('run-1')).rejects.toThrow(/no registra el perfil/);
    expect(repository.saveConnections).not.toHaveBeenCalled();
    expect(repository.savePosts).not.toHaveBeenCalled();
  });

  it('con persist=false devuelve el resumen sin escribir', async () => {
    client.getRun.mockResolvedValue(run());
    client.fetchContacts.mockResolvedValue([{ name: 'Ana', isIcp: true }]);

    const result = await service.getRunStatus('run-1', { persist: false });

    expect(result.persisted).toBe(false);
    expect(result.summary.contacts).toBe(1);
    expect(repository.saveConnections).not.toHaveBeenCalled();
  });

  it('propaga el error si Apify no encuentra la corrida', async () => {
    client.getRun.mockRejectedValue(new Error('Corrida no encontrada'));

    await expect(service.getRunStatus('nope')).rejects.toThrow('Corrida no encontrada');
  });
});

describe('progreso mientras corre', () => {
  it('devuelve las personas reconocidas hasta ahora, sin esperar el final', async () => {
    // El scraper tarda ~90s y devuelve todo al final; el analisis tarda 1s. Sin
    // parciales la pantalla queda en blanco todo ese rato.
    client.getRun.mockResolvedValue(run({ status: 'RUNNING', finishedAt: null }));
    client.fetchProgress.mockResolvedValue([
      { nombre: 'Ana', photoUrl: 'https://x/a.jpg', interactions: 2 },
      { nombre: 'Bryan', photoUrl: 'https://x/b.jpg', interactions: 1 },
    ]);

    const result = await service.getRunStatus('run-1');

    expect(result.finished).toBe(false);
    expect(result.progreso).toHaveLength(2);
    expect(result.progreso[0].nombre).toBe('Ana');
  });

  it('mientras corre sigue sin tocar la base', async () => {
    client.getRun.mockResolvedValue(run({ status: 'RUNNING', finishedAt: null }));
    client.fetchProgress.mockResolvedValue([{ nombre: 'Ana' }]);

    await service.getRunStatus('run-1');

    expect(repository.saveConnections).not.toHaveBeenCalled();
  });

  it('si el progreso falla, la corrida sigue viva', async () => {
    // El progreso es cosmetico: que no se pueda leer no puede romper el
    // polling ni perder la corrida que se esta pagando.
    client.getRun.mockResolvedValue(run({ status: 'RUNNING', finishedAt: null }));
    client.fetchProgress.mockRejectedValue(new Error('dataset no existe todavia'));

    const result = await service.getRunStatus('run-1');

    expect(result.finished).toBe(false);
    expect(result.progreso).toEqual([]);
  });
});

describe('el dueño en el progreso', () => {
  it('lo separa de la gente de la red', async () => {
    // El dueño llega por la misma cola pero marcado con `tipo`. No es un
    // contacto — es de quien es la red — asi que no puede aparecer entre las
    // caras que el front dibuja como su audiencia.
    client.getRun.mockResolvedValue(run({ status: 'RUNNING', finishedAt: null }));
    client.fetchProgress.mockResolvedValue([
      { tipo: 'dueno', nombre: 'Juan Nicolas', photoUrl: 'https://x/yo.jpg' },
      { nombre: 'Ana', photoUrl: 'https://x/a.jpg' },
      { nombre: 'Bryan', photoUrl: 'https://x/b.jpg' },
    ]);

    const result = await service.getRunStatus('run-1');

    expect(result.progreso).toHaveLength(2);
    expect(result.progreso.map((p) => p.nombre)).toEqual(['Ana', 'Bryan']);
    expect(result.dueno.photoUrl).toBe('https://x/yo.jpg');
  });

  it('sin dueño todavia, el resto sigue llegando', async () => {
    client.getRun.mockResolvedValue(run({ status: 'RUNNING', finishedAt: null }));
    client.fetchProgress.mockResolvedValue([{ nombre: 'Ana' }]);

    const result = await service.getRunStatus('run-1');

    expect(result.progreso).toHaveLength(1);
    expect(result.dueno).toBeNull();
  });
});

describe('promedio de likes y comentarios', () => {
  const { averagePostMetrics } = require('../network.service');

  it('promedia solo los posts con métrica, no trata un ausente como cero', () => {
    expect(averagePostMetrics([
      { reactions: 67, comments: 5 },
      { reactions: 14, comments: 0 },
      { text: 'sin métrica' },
    ])).toEqual({
      postsConMetrica: 2,
      promedioReacciones: 40.5,
      promedioComentarios: 2.5,
    });
  });

  it('el scrape de Thomas da 49 likes y 1.7 comentarios sobre 3 posts', () => {
    const resumen = averagePostMetrics([
      { reactions: 67, comments: 5 },
      { reactions: 66, comments: 0 },
      { reactions: 14, comments: 0 },
    ]);
    expect(resumen.promedioReacciones).toBe(49);
    expect(resumen.promedioComentarios.toFixed(1)).toBe('1.7');
  });
});
