import { createApiClient } from '@apis/client/Api.client';
import { API_ENDPOINTS } from '@configs/Api.endpoints';
import { createFakeApi, deferred, TEST_API_BASE_URL } from '@test/FakeApi.fixture';

import { installAuthInterceptor } from './Auth.interceptor';
import { singleFlight } from './SingleFlight.rules';

const PROTECTED = '/content/posts';
const OLD = 'old-token';
const NEW = 'new-token';

function setup(options: { refreshFails?: boolean; hold?: Promise<void> } = {}) {
  let token: string | null = OLD;
  const api = createFakeApi({
    [`GET ${PROTECTED}`]: (config) =>
      config.headers.get('Authorization') === `Bearer ${NEW}`
        ? { status: 200, data: { ok: true } }
        : { status: 401 },
  });
  const client = createApiClient(TEST_API_BASE_URL, { adapter: api.adapter });
  const refreshRuns = vi.fn<() => void>();
  const onSessionExpired = vi.fn<() => void>();
  const refreshAccessToken = singleFlight(async () => {
    refreshRuns();
    await options.hold;
    if (options.refreshFails === true) throw new Error('refresh refused');
    token = NEW;
    return NEW;
  });
  installAuthInterceptor(client, {
    getAccessToken: () => token,
    refreshAccessToken,
    onSessionExpired,
  });
  return {
    api,
    client,
    refreshRuns,
    onSessionExpired,
    setToken: (value: string | null) => {
      token = value;
    },
  };
}

describe('installAuthInterceptor', () => {
  it('sends the in-memory access token as a Bearer header', async () => {
    const { api, client, setToken } = setup();
    setToken(NEW);
    await client.get(PROTECTED);
    expect(api.calls[0]?.headers.get('Authorization')).toBe(`Bearer ${NEW}`);
  });

  it('refreshes once on a 401 and retries the call with the new token', async () => {
    const { api, client, refreshRuns, onSessionExpired } = setup();
    const res = await client.get(PROTECTED);
    expect(res.data).toEqual({ ok: true });
    expect(refreshRuns).toHaveBeenCalledTimes(1);
    expect(api.callsTo(`GET ${PROTECTED}`)).toHaveLength(2);
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it('queues concurrent 401s behind one refresh, then retries them all', async () => {
    const gate = deferred<void>();
    const { api, client, refreshRuns } = setup({ hold: gate.promise });
    const requests = [1, 2, 3].map(() => client.get(PROTECTED));
    await vi.waitFor(() => {
      expect(refreshRuns).toHaveBeenCalledTimes(1);
    });
    gate.resolve();
    const results = await Promise.all(requests);
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(refreshRuns).toHaveBeenCalledTimes(1);
    expect(api.callsTo(`GET ${PROTECTED}`)).toHaveLength(6);
  });

  it('retries a call that failed with an older token without refreshing again', async () => {
    const { client, refreshRuns, setToken, api } = setup();
    const gate = deferred<void>();
    // The call leaves with OLD; by the time its 401 lands, NEW is current.
    api.handlers[`GET ${PROTECTED}`] = async (config) => {
      if (config.headers.get('Authorization') === `Bearer ${OLD}`) {
        await gate.promise;
        return { status: 401 };
      }
      return { status: 200 };
    };
    const pending = client.get(PROTECTED);
    setToken(NEW);
    gate.resolve();
    expect((await pending).status).toBe(200);
    expect(refreshRuns).not.toHaveBeenCalled();
  });

  it('ends the session and rejects when the refresh fails', async () => {
    const { client, onSessionExpired } = setup({ refreshFails: true });
    await expect(client.get(PROTECTED)).rejects.toMatchObject({
      response: { status: 401 },
    });
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('never loops: a second 401 after the retry ends the session', async () => {
    const { api, client, refreshRuns, onSessionExpired } = setup();
    api.handlers[`GET ${PROTECTED}`] = () => ({ status: 401 });
    await expect(client.get(PROTECTED)).rejects.toMatchObject({
      response: { status: 401 },
    });
    expect(refreshRuns).toHaveBeenCalledTimes(1);
    expect(api.callsTo(`GET ${PROTECTED}`)).toHaveLength(2);
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it.each([API_ENDPOINTS.AUTH.LOGIN, API_ENDPOINTS.AUTH.REFRESH, API_ENDPOINTS.AUTH.LOGOUT])(
    'never refreshes or retries %s, and sends it no Bearer header',
    async (path) => {
      const { api, client, refreshRuns, onSessionExpired } = setup();
      api.handlers[`POST ${path}`] = () => ({ status: 401 });
      await expect(
        client.post(path, undefined, { shouldSkipAuthRefresh: true }),
      ).rejects.toMatchObject({ response: { status: 401 } });
      expect(api.calls).toHaveLength(1);
      expect(api.calls[0]?.headers.get('Authorization')).toBeUndefined();
      expect(refreshRuns).not.toHaveBeenCalled();
      expect(onSessionExpired).not.toHaveBeenCalled();
    },
  );

  it('leaves other errors alone', async () => {
    const { api, client, refreshRuns } = setup();
    api.handlers[`GET ${PROTECTED}`] = () => ({ status: 403 });
    await expect(client.get(PROTECTED)).rejects.toMatchObject({
      response: { status: 403 },
    });
    expect(refreshRuns).not.toHaveBeenCalled();
  });

  describe('fresh token before a flagged request', () => {
    const SECONDS_PER_MINUTE = 60;
    const jwtExpiringIn = (seconds: number) => {
      const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + seconds }))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      return `h.${payload}.s`;
    };
    const flagged = { shouldRefreshExpiringToken: true };

    it('refreshes a token that expires within 60 s and sends the new one', async () => {
      const { api, client, refreshRuns, setToken } = setup();
      setToken(jwtExpiringIn(30));
      await client.get(PROTECTED, flagged);
      expect(refreshRuns).toHaveBeenCalledTimes(1);
      expect(api.calls[0]?.headers.get('Authorization')).toBe(`Bearer ${NEW}`);
    });

    it('refreshes a token whose expiry cannot be read', async () => {
      const { client, refreshRuns } = setup();
      await client.get(PROTECTED, flagged);
      expect(refreshRuns).toHaveBeenCalledTimes(1);
    });

    it('keeps a fresh token', async () => {
      const { api, client, setToken } = setup();
      const fresh = jwtExpiringIn(10 * SECONDS_PER_MINUTE);
      setToken(fresh);
      await client.get(PROTECTED, flagged).catch(() => undefined);
      expect(api.calls[0]?.headers.get('Authorization')).toBe(`Bearer ${fresh}`);
    });

    it('shares one refresh between two flagged requests', async () => {
      const { client, refreshRuns, setToken } = setup();
      setToken(jwtExpiringIn(5));
      await Promise.all([client.get(PROTECTED, flagged), client.get(PROTECTED, flagged)]);
      expect(refreshRuns).toHaveBeenCalledTimes(1);
    });

    it('ends the session and sends nothing when the refresh is refused', async () => {
      const { api, client, onSessionExpired, setToken } = setup({ refreshFails: true });
      setToken(jwtExpiringIn(5));
      await expect(client.get(PROTECTED, flagged)).rejects.toThrow('refresh refused');
      expect(onSessionExpired).toHaveBeenCalledTimes(1);
      expect(api.calls).toHaveLength(0);
    });

    it('leaves an unflagged request untouched', async () => {
      const { client, refreshRuns, setToken } = setup();
      setToken(jwtExpiringIn(5));
      await client.get(PROTECTED).catch(() => undefined);
      expect(refreshRuns).toHaveBeenCalledTimes(1); // only the 401 retry path
    });
  });
});
