import { waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { makeMeUser } from '@/test/fixtures';
import { server } from '@/test/msw/server';
import { renderHookWithProviders } from '@/test/renderWithProviders';

import { useCurrentUserQuery } from './useCurrentUserQuery';

describe('useCurrentUserQuery', () => {
  it('fetches /auth/me with the bearer token', async () => {
    let authorization: string | null = null;
    server.use(
      http.get('*/api/v1/auth/me', ({ request }) => {
        authorization = request.headers.get('authorization');
        return HttpResponse.json(makeMeUser({ name: 'Fresh Name' }));
      }),
    );

    const { result } = renderHookWithProviders(() => useCurrentUserQuery(), {
      auth: { status: 'authenticated', accessToken: 'tok-1' },
    });

    await waitFor(() => expect(result.current.data?.name).toBe('Fresh Name'));
    expect(authorization).toBe('Bearer tok-1');
  });

  it('refreshes the access token transparently on a 401', async () => {
    server.use(
      http.post('*/api/v1/auth/refresh', () =>
        HttpResponse.json({ message: 'ok', accessToken: 'tok-2' }),
      ),
      http.get('*/api/v1/auth/me', ({ request }) =>
        request.headers.get('authorization') === 'Bearer tok-2'
          ? HttpResponse.json(makeMeUser({ name: 'After Refresh' }))
          : HttpResponse.json({ statusCode: 401, message: 'Unauthorized' }, { status: 401 }),
      ),
    );

    const { result, store } = renderHookWithProviders(() => useCurrentUserQuery(), {
      auth: { status: 'authenticated', accessToken: 'expired' },
    });

    await waitFor(() => expect(result.current.data?.name).toBe('After Refresh'));
    expect(store.getState().auth.accessToken).toBe('tok-2');
  });
});
