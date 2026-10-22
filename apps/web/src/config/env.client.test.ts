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

  it('leaves the admin URL undefined when blank', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', '/api/v1');
    vi.stubEnv('NEXT_PUBLIC_ADMIN_URL', ' ');
    const { appEnv } = await import('./env.client');
    expect(appEnv.adminUrl).toBeUndefined();
  });

  it('accepts an http(s) URL or a path and strips trailing slashes', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', '/api/v1');
    vi.stubEnv('NEXT_PUBLIC_ADMIN_URL', 'https://admin.example.com/');
    expect((await import('./env.client')).appEnv.adminUrl).toBe(
      'https://admin.example.com',
    );
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_ADMIN_URL', '/admin/');
    expect((await import('./env.client')).appEnv.adminUrl).toBe('/admin');
  });

  it.each([
    'javascript:alert(1)',
    '//evil.example',
    'admin.example.com',
    '/\\evil.example',
    '/\t/evil.example',
  ])('rejects %s as the admin URL', async (value) => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', '/api/v1');
    vi.stubEnv('NEXT_PUBLIC_ADMIN_URL', value);
    await expect(import('./env.client')).rejects.toThrow(
      /NEXT_PUBLIC_ADMIN_URL must be/,
    );
  });
});
