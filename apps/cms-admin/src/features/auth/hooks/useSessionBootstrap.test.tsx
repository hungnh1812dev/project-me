import { StrictMode, type ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it } from 'vitest';

import { makeQueryClient } from '@/app/queryClient';
import { makeStore } from '@/app/store';
import { makeMeUser } from '@/test/fixtures';
import { server } from '@/test/msw/server';

import { resetBootstrapLatch } from '../store/sessionThunks';
import { useSessionBootstrap } from './useSessionBootstrap';

beforeEach(() => {
  resetBootstrapLatch();
});

describe('useSessionBootstrap', () => {
  it('bootstraps the session once, even under StrictMode double mounting', async () => {
    let refreshes = 0;
    const user = makeMeUser();
    server.use(
      http.post('*/api/v1/auth/refresh', () => {
        refreshes += 1;
        return HttpResponse.json({ message: 'ok', accessToken: 'tok' });
      }),
      http.get('*/api/v1/auth/me', () => HttpResponse.json(user)),
    );
    const store = makeStore({ queryClient: makeQueryClient() });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <StrictMode>
        <Provider store={store}>{children}</Provider>
      </StrictMode>
    );

    const { rerender } = renderHook(() => useSessionBootstrap(), { wrapper });
    rerender();

    await waitFor(() => expect(store.getState().auth.status).toBe('authenticated'));
    expect(refreshes).toBe(1);
  });
});
