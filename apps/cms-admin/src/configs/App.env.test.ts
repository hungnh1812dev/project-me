const KEY_NAMES = ['VITE_API_BASE_URL', 'VITE_TURNSTILE_SITE_KEY'] as const;

async function importAppEnv() {
  vi.resetModules();
  return import('./App.env');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('appEnv', () => {
  it('exposes the Turnstile site key from the env', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key');
    const { appEnv } = await importAppEnv();
    expect(appEnv.turnstileSiteKey).toBe('site-key');
  });

  it.each(KEY_NAMES)('throws when %s is missing', async (name) => {
    vi.stubEnv(name, '');
    await expect(importAppEnv()).rejects.toThrow(`${name} is not set`);
  });

  it('throws when the Turnstile site key is blank', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '   ');
    await expect(importAppEnv()).rejects.toThrow('VITE_TURNSTILE_SITE_KEY is not set');
  });

  it('takes the cms-api origin from an absolute base URL', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.domain.localhost/api/v1/');
    const { appEnv } = await importAppEnv();
    expect(appEnv.apiOrigin).toBe('https://api.domain.localhost');
  });

  it('takes the page origin from a relative base URL', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '/api/v1');
    const { appEnv } = await importAppEnv();
    expect(appEnv.apiOrigin).toBe(window.location.origin);
  });

  it('throws naming the key when the base URL does not parse', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://[bad');
    await expect(importAppEnv()).rejects.toThrow('VITE_API_BASE_URL is not a valid URL');
  });
});
