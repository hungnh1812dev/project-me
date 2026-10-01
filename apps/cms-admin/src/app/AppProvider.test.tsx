import { useQueryClient } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { resetBootstrapLatch } from '@/features/auth/store/sessionThunks';
import { useTheme } from '@/features/theme/useTheme';
import { makeMeUser } from '@/test/fixtures';
import { server } from '@/test/msw/server';

import AppProvider from './AppProvider';
import { useAppSelector } from './hooks';
import { makeQueryClient, queryClient as sharedQueryClient } from './queryClient';
import { makeStore } from './store';

beforeEach(() => {
  resetBootstrapLatch();
});

const Status = () => <p>status: {useAppSelector((s) => s.auth.status)}</p>;

describe('AppProvider', () => {
  it('provides the store and runs the session bootstrap', async () => {
    let refreshes = 0;
    server.use(
      http.post('*/api/v1/auth/refresh', () => {
        refreshes += 1;
        return HttpResponse.json({ message: 'ok', accessToken: 'tok' });
      }),
      http.get('*/api/v1/auth/me', () => HttpResponse.json(makeMeUser())),
    );
    const store = makeStore({ queryClient: makeQueryClient() });

    render(
      <AppProvider store={store}>
        <Status />
      </AppProvider>,
    );

    expect(await screen.findByText('status: authenticated')).toBeInTheDocument();
    expect(refreshes).toBe(1);
  });

  it('provides the shared QueryClient by default', () => {
    const Probe = () => <p>{useQueryClient() === sharedQueryClient ? 'shared' : 'other'}</p>;

    render(
      <AppProvider store={makeStore({ queryClient: makeQueryClient() })}>
        <Probe />
      </AppProvider>,
    );

    expect(screen.getByText('shared')).toBeInTheDocument();
  });

  it('provides the theme', () => {
    const Probe = () => <p>theme: {useTheme().choice}</p>;

    render(
      <AppProvider store={makeStore({ queryClient: makeQueryClient() })}>
        <Probe />
      </AppProvider>,
    );

    expect(screen.getByText('theme: system')).toBeInTheDocument();
  });
});
