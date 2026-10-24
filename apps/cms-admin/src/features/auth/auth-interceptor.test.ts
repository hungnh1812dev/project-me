import {
  createFakeApi,
  deferred,
  TEST_API_BASE_URL,
} from '../../../test/fake-api';
import { API_ENDPOINTS } from '../../config/endpoints';
import { createApiClient } from '../../lib/api-client';
import { installAuthInterceptor } from './auth-interceptor';
import { singleFlight } from './single-flight';

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

  it.each([
    API_ENDPOINTS.AUTH.LOGIN,
    API_ENDPOINTS.AUTH.REFRESH,
    API_ENDPOINTS.AUTH.LOGOUT,
  ])(
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
});
