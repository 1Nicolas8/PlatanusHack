jest.mock('../../../config/env', () => ({
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
}));

const env = require('../../../config/env');
const { checkDatabase } = require('../health.service');

describe('checkDatabase', () => {
  beforeEach(() => {
    env.SUPABASE_URL = 'https://example.supabase.co';
    env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
    global.fetch = jest.fn();
  });

  it('devuelve ok cuando PostgREST responde 200', async () => {
    global.fetch.mockResolvedValue({ ok: true, status: 200 });

    await expect(checkDatabase()).resolves.toEqual({ ok: true });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.supabase.co/rest/v1/',
      expect.objectContaining({ headers: expect.objectContaining({ apikey: 'service-role-key' }) }),
    );
  });

  it('devuelve el status cuando la credencial es rechazada', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 401 });

    await expect(checkDatabase()).resolves.toEqual({
      ok: false,
      reason: 'PostgREST respondió 401',
    });
  });

  it('no propaga la excepción si la red falla', async () => {
    global.fetch.mockRejectedValue(new Error('fetch failed'));

    await expect(checkDatabase()).resolves.toEqual({ ok: false, reason: 'fetch failed' });
  });

  it('avisa cuando falta configuración en vez de intentar la request', async () => {
    env.SUPABASE_URL = undefined;

    await expect(checkDatabase()).resolves.toEqual({
      ok: false,
      reason: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no configuradas',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
