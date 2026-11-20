describe('appEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('exposes no cms-api URL', async () => {
    const { appEnv } = await import('./Browser.env');
    expect(Object.keys(appEnv)).not.toContain('apiBaseUrl');
  });

  it('throws when NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset', async () => {
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '');
    await expect(import('./Browser.env')).rejects.toThrow(
      /NEXT_PUBLIC_TURNSTILE_SITE_KEY is not set/,
    );
  });
});
