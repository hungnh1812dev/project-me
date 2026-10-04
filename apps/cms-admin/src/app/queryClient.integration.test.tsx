import { useQuery } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { cmsApi } from '@/core/api/CmsApi';
import { makeMeUser } from '@/test/fixtures';
import { server } from '@/test/msw/server';
import { renderWithProviders } from '@/test/renderWithProviders';

const ContentTypes = () => {
  const { data } = useQuery({
    queryKey: ['content-types'],
    queryFn: async () => (await cmsApi.get<{ uid: string }[]>('/content-types')).data,
  });
  return <p>{data ? data.map((t) => t.uid).join(',') : 'loading'}</p>;
};

describe('React Query through cmsApi (AC-17)', () => {
  it('recovers transparently from a 401: refresh, then the retried request returns data', async () => {
    let refreshes = 0;
    const seen: (string | null)[] = [];
    server.use(
      http.post('*/api/v1/auth/refresh', () => {
        refreshes += 1;
        return HttpResponse.json({ message: 'ok', accessToken: 'fresh' });
      }),
      http.get('*/api/v1/content-types', ({ request }) => {
        const auth = request.headers.get('Authorization');
        seen.push(auth);
        return auth === 'Bearer fresh'
          ? HttpResponse.json([{ uid: 'article' }])
          : HttpResponse.json({ statusCode: 401, message: 'Unauthorized' }, { status: 401 });
      }),
    );

    const { store } = renderWithProviders(<ContentTypes />, {
      auth: { status: 'authenticated', accessToken: 'expired', user: makeMeUser() },
    });

    expect(await screen.findByText('article')).toBeInTheDocument();
    expect(refreshes).toBe(1);
    expect(seen).toEqual(['Bearer expired', 'Bearer fresh']);
    expect(store.getState().auth).toMatchObject({
      status: 'authenticated',
      accessToken: 'fresh',
    });
  });
});
