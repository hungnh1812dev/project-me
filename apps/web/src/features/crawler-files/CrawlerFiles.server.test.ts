import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getServerEnv } from '@/configs/Server.env';

import { buildRobots, buildSitemap, readRobots, readSitemap } from './CrawlerFiles.server';

const connectionMock = vi.hoisted(() => vi.fn<() => Promise<void>>(() => Promise.resolve()));
vi.mock('next/server', () => ({ connection: connectionMock }));
vi.mock('@/configs/Server.env', () => ({
  getServerEnv: vi.fn<() => ReturnType<typeof getServerEnv>>(),
}));

const WEB_ORIGIN = 'https://domain.example';

describe('buildRobots', () => {
  it('allows the site but not the BFF in production', () => {
    expect(buildRobots({ appEnv: 'production', webOrigin: WEB_ORIGIN })).toEqual({
      rules: { userAgent: '*', allow: '/', disallow: '/api/' },
      sitemap: `${WEB_ORIGIN}/sitemap.xml`,
    });
  });

  it.each(['staging', 'development'] as const)('disallows the whole site on %s', (appEnv) => {
    expect(buildRobots({ appEnv, webOrigin: WEB_ORIGIN })).toEqual({
      rules: { userAgent: '*', disallow: '/' },
      sitemap: `${WEB_ORIGIN}/sitemap.xml`,
    });
  });
});

describe('buildSitemap', () => {
  it('lists each path absolute on the origin, without lastModified or double slash', () => {
    expect(buildSitemap({ webOrigin: WEB_ORIGIN, pagePaths: ['/', '/status'] })).toEqual([
      { url: 'https://domain.example/' },
      { url: 'https://domain.example/status' },
    ]);
  });
});

describe('readRobots and readSitemap', () => {
  beforeEach(() => {
    connectionMock.mockClear();
    vi.mocked(getServerEnv).mockReturnValue({
      appEnv: 'production',
      webOrigin: WEB_ORIGIN,
    } as ReturnType<typeof getServerEnv>);
  });

  it('read the runtime env per request', async () => {
    const robots = await readRobots();
    const sitemap = await readSitemap();
    expect(connectionMock).toHaveBeenCalledTimes(2);
    expect(robots.sitemap).toBe(`${WEB_ORIGIN}/sitemap.xml`);
    expect(sitemap.map((entry) => entry.url)).toEqual([`${WEB_ORIGIN}/`, `${WEB_ORIGIN}/status`]);
  });
});
