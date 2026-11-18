// @vitest-environment node

import { readMock } from './MockFallback.server';
import type { MockKey } from './mocks/MockView';

const env = vi.hoisted(() => ({ isMockFallbackOn: true }));
vi.mock('../../../configs/Server.env', () => ({ getServerEnv: () => env }));
vi.mock('./mocks/MockView', () => ({
  MOCK_VIEW: { 'site-header': { header: { name: 'mock name' } } },
}));
const connectionMock = vi.hoisted(() => vi.fn<() => Promise<void>>(() => Promise.resolve()));
vi.mock('next/server', () => ({ connection: connectionMock }));

const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

beforeEach(() => {
  warn.mockClear();
  connectionMock.mockClear();
  env.isMockFallbackOn = true;
  vi.unstubAllEnvs();
});

describe('readMock with the fallback on', () => {
  it('returns the mock, warns once without data and opts out of caching', async () => {
    await expect(readMock('site-header', 'SiteHeader', 'NETWORK_ERROR')).resolves.toEqual({
      header: { name: 'mock name' },
    });
    expect(warn.mock.calls).toEqual([['[mock] SiteHeader site-header NETWORK_ERROR']]);
    expect(connectionMock).toHaveBeenCalledTimes(1);
  });

  it('returns undefined and stays quiet for a key with no mock', async () => {
    await expect(readMock('unknown' as MockKey, 'Page', 'NO_DATA')).resolves.toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
    expect(connectionMock).not.toHaveBeenCalled();
  });
});

describe('readMock with the fallback off', () => {
  it('returns undefined when the runtime fallback is off', async () => {
    env.isMockFallbackOn = false;
    await expect(readMock('site-header', 'SiteHeader', 'NETWORK_ERROR')).resolves.toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it('never loads a mock when the build APP_ENV is production', async () => {
    vi.stubEnv('APP_ENV_BUILD', 'production');
    await expect(readMock('site-header', 'SiteHeader', 'NETWORK_ERROR')).resolves.toBeUndefined();
    expect(connectionMock).not.toHaveBeenCalled();
  });
});
