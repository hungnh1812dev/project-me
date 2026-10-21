describe('appEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('strips the trailing slash from NEXT_PUBLIC_API_BASE_URL', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', '/api/v1/');
    const { appEnv } = await import('./env.client');
    expect(appEnv.apiBaseUrl).toBe('/api/v1');
  });

  it('throws when NEXT_PUBLIC_API_BASE_URL is unset', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', '');
    await expect(import('./env.client')).rejects.toThrow(
      /NEXT_PUBLIC_API_BASE_URL is not set/,
    );
  });
});
