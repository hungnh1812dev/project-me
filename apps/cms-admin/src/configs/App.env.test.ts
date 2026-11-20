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
});
