import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApiBaseUrl } from './env';

describe('buildApiBaseUrl', () => {
  it('returns the relative /api/v1 when VITE_API_URL is unset', () => {
    expect(buildApiBaseUrl(undefined)).toBe('/api/v1');
  });

  it('returns the relative /api/v1 when VITE_API_URL is empty or blank', () => {
    expect(buildApiBaseUrl('')).toBe('/api/v1');
    expect(buildApiBaseUrl('   ')).toBe('/api/v1');
  });

  it('appends /api/v1 to the configured origin', () => {
    expect(buildApiBaseUrl('https://cms.example.com')).toBe('https://cms.example.com/api/v1');
  });

  it('strips trailing slashes from the configured origin', () => {
    expect(buildApiBaseUrl('https://cms.example.com//')).toBe('https://cms.example.com/api/v1');
  });
});

describe('API_BASE_URL', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('is derived from import.meta.env.VITE_API_URL', async () => {
    vi.stubEnv('VITE_API_URL', 'http://localhost:8080/');
    vi.resetModules();

    const { API_BASE_URL } = await import('./env');

    expect(API_BASE_URL).toBe('http://localhost:8080/api/v1');
  });

  it('falls back to /api/v1 when VITE_API_URL is empty', async () => {
    vi.stubEnv('VITE_API_URL', '');
    vi.resetModules();

    const { API_BASE_URL } = await import('./env');

    expect(API_BASE_URL).toBe('/api/v1');
  });
});
