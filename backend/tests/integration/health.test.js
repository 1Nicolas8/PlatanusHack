jest.mock('../../src/shared/health/health.service');

const request = require('supertest');
const createApp = require('../../src/app');
const { checkDatabase } = require('../../src/shared/health/health.service');

describe('GET /health', () => {
  it('responde 200 ok', async () => {
    const response = await request(createApp()).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});

describe('GET /health/ready', () => {
  beforeEach(() => jest.clearAllMocks());

  it('responde 200 ready cuando la base contesta', async () => {
    checkDatabase.mockResolvedValue({ ok: true });
    const response = await request(createApp()).get('/health/ready');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ready', database: { ok: true } });
  });

  it('responde 503 degraded cuando la base no contesta', async () => {
    checkDatabase.mockResolvedValue({ ok: false, reason: 'connection refused' });
    const response = await request(createApp()).get('/health/ready');

    expect(response.status).toBe(503);
    expect(response.body.status).toBe('degraded');
    expect(response.body.database.reason).toBe('connection refused');
  });
});

describe('404', () => {
  it('responde con el shape de error estándar en una ruta inexistente', async () => {
    const response = await request(createApp()).get('/api/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty('error');
  });
});
