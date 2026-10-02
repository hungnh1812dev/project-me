import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { server } from '@/test/msw/server';

import { ApiError } from './apiError';
import { cmsApi, configureCmsApi, refreshAccessToken } from './CmsApi';

const unauthorized = () =>
  HttpResponse.json(
    { statusCode: 401, message: 'Unauthorized', error: 'Unauthorized' },
    { status: 401 },
  );

/** A fake session: protected routes accept only the current token; refresh rotates it. */
function setup() {
  let token: string | null = 'expired-token';
  const onTokenRefreshed = vi.fn((next: string) => {
    token = next;
  });
  const onSessionExpired = vi.fn(() => {
    token = null;
  });
  configureCmsApi({ getAccessToken: () => token, onTokenRefreshed, onSessionExpired });
  return { onTokenRefreshed, onSessionExpired, getToken: () => token };
}

function refreshHandler(
  respond: () => Response = () => HttpResponse.json({ message: 'ok', accessToken: 'fresh-token' }),
) {
  const calls = { count: 0 };
  server.use(
    http.post('*/api/v1/auth/refresh', () => {
      calls.count += 1;
      return respond();
    }),
  );
  return calls;
}

/** GET /items/:id answers 200 only to `Bearer fresh-token`, and records every Authorization header. */
function protectedItems() {
  const seen: (string | null)[] = [];
  server.use(
    http.get('*/api/v1/items/:id', ({ request, params }) => {
      const auth = request.headers.get('Authorization');
      seen.push(auth);
      if (auth !== 'Bearer fresh-token') return unauthorized();
      return HttpResponse.json({ id: params.id });
    }),
  );
  return seen;
}

describe('401 refresh and retry', () => {
  let session: ReturnType<typeof setup>;

  beforeEach(() => {
    session = setup();
  });

  it('refreshes once, stores the new token and retries once with the new bearer', async () => {
    const refresh = refreshHandler();
    const seen = protectedItems();

    const res = await cmsApi.get<{ id: string }>('/items/1');

    expect(res.data).toEqual({ id: '1' });
    expect(refresh.count).toBe(1);
    expect(session.onTokenRefreshed).toHaveBeenCalledExactlyOnceWith('fresh-token');
    expect(seen).toEqual(['Bearer expired-token', 'Bearer fresh-token']);
    expect(session.onSessionExpired).not.toHaveBeenCalled();
  });

  it('sends exactly one refresh for three concurrent 401s and retries all of them', async () => {
    const refresh = refreshHandler();
    protectedItems();

    const results = await Promise.all(
      ['1', '2', '3'].map((id) => cmsApi.get<{ id: string }>(`/items/${id}`)),
    );

    expect(results.map((r) => r.data.id)).toEqual(['1', '2', '3']);
    expect(refresh.count).toBe(1);
    expect(session.onTokenRefreshed).toHaveBeenCalledTimes(1);
  });

  it('reuses the in-flight refresh promise across refreshAccessToken() callers', async () => {
    const refresh = refreshHandler();

    const first = refreshAccessToken();
    const second = refreshAccessToken();

    expect(second).toBe(first);
    await expect(first).resolves.toBe('fresh-token');
    expect(refresh.count).toBe(1);
  });

  it('starts a new refresh once the previous one has settled', async () => {
    const refresh = refreshHandler();

    await refreshAccessToken();
    await refreshAccessToken();

    expect(refresh.count).toBe(2);
  });

  it('expires the session once and rejects with 401 when the refresh returns 401', async () => {
    const refresh = refreshHandler(unauthorized);
    protectedItems();

    const errors = await Promise.all(
      ['1', '2', '3'].map((id) => cmsApi.get(`/items/${id}`).catch((e: unknown) => e)),
    );

    for (const error of errors) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ status: 401 });
    }
    expect(refresh.count).toBe(1);
    expect(session.onSessionExpired).toHaveBeenCalledTimes(1);
    expect(session.onTokenRefreshed).not.toHaveBeenCalled();
    expect(session.getToken()).toBeNull();
  });

  it('expires the session when the refresh fails with a network error', async () => {
    refreshHandler(() => HttpResponse.error());
    protectedItems();

    const error = await cmsApi.get('/items/1').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401 });
    expect(session.onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('expires the session once without a second refresh when the retry gets 401 again', async () => {
    const refresh = refreshHandler();
    server.use(http.get('*/api/v1/always-401/:id', unauthorized));

    const errors = await Promise.all(
      ['1', '2', '3'].map((id) => cmsApi.get(`/always-401/${id}`).catch((e: unknown) => e)),
    );

    for (const error of errors) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ status: 401 });
    }
    expect(refresh.count).toBe(1);
    expect(session.onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it.each(['/auth/login', '/auth/logout'])('never refreshes on a 401 from %s', async (path) => {
    const refresh = refreshHandler();
    server.use(http.post(`*/api/v1${path}`, unauthorized));

    const error = await cmsApi.post(path, {}).catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 401 });
    expect(refresh.count).toBe(0);
    expect(session.onSessionExpired).not.toHaveBeenCalled();
  });

  it('never refreshes on a 401 from /auth/refresh itself', async () => {
    const refresh = refreshHandler(unauthorized);

    const error = await cmsApi.post('/auth/refresh').catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 401 });
    expect(refresh.count).toBe(1);
    expect(session.onSessionExpired).not.toHaveBeenCalled();
  });

  it('never refreshes on a 401 from a request marked skipAuthRefresh', async () => {
    const refresh = refreshHandler();
    server.use(http.get('*/api/v1/auth/me', unauthorized));

    const error = await cmsApi.get('/auth/me', { skipAuthRefresh: true }).catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 401 });
    expect(refresh.count).toBe(0);
  });

  it('retries with the current token, without refreshing, when it rotated while the request was in flight', async () => {
    const refresh = refreshHandler();
    const seen: (string | null)[] = [];
    server.use(
      http.get('*/api/v1/slow/:id', ({ request }) => {
        const auth = request.headers.get('Authorization');
        seen.push(auth);
        if (auth === 'Bearer fresh-token') return HttpResponse.json({ ok: true });
        // Another caller refreshed while this request was in flight.
        session.onTokenRefreshed('fresh-token');
        return unauthorized();
      }),
    );

    const res = await cmsApi.get<{ ok: boolean }>('/slow/1');

    expect(res.data).toEqual({ ok: true });
    expect(seen).toEqual(['Bearer expired-token', 'Bearer fresh-token']);
    expect(refresh.count).toBe(0);
  });

  it('does not refresh again for a late 401 carrying a token whose session already expired', async () => {
    const refresh = refreshHandler(unauthorized);
    protectedItems();
    await cmsApi.get('/items/1').catch(() => undefined);

    const late = await cmsApi
      .get('/items/2', { headers: { Authorization: 'Bearer expired-token' } })
      .catch((e: unknown) => e);

    expect(late).toMatchObject({ status: 401 });
    expect(refresh.count).toBe(1);
    expect(session.onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('rejects refreshAccessToken() with an ApiError without expiring the session', async () => {
    refreshHandler(unauthorized);

    await expect(refreshAccessToken()).rejects.toMatchObject({ status: 401 });
    expect(session.onSessionExpired).not.toHaveBeenCalled();
  });
});
