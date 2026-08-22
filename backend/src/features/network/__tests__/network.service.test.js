jest.mock('../network.client');
jest.mock('../network.repository');

const client = require('../network.client');
const repository = require('../network.repository');
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
  repository.saveConnections.mockResolvedValue(0);
  repository.savePosts.mockResolvedValue(0);
  client.fetchContacts.mockResolvedValue([]);
  client.fetchPosts.mockResolvedValue([]);
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
    repository.saveConnections.mockResolvedValue(2);
    repository.savePosts.mockResolvedValue(1);

    const result = await service.getRunStatus('run-1');

    expect(result.summary).toEqual({ contacts: 2, posts: 1, icpContacts: 1 });
    expect(result.written).toEqual({ connections: 2, posts: 1 });
    expect(result.persisted).toBe(true);
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
