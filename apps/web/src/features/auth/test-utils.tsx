import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios';
import type { ReactNode } from 'react';
import type { Mock } from 'vitest';

import type { AuthApi, CurrentUser } from './auth.api';
import { WebSessionProvider } from './useWebSession';

export const TEST_USER: CurrentUser = {
  id: 'acc-1',
  email: 'owner@example.com',
  displayName: 'Mai Owner',
  role: 'viewer',
  permissions: ['article:read', 'profile:read'],
};

/** An editor: holds write permissions, so the web refuses its session. */
export const PRIVILEGED_USER: CurrentUser = {
  ...TEST_USER,
  role: 'editor',
  permissions: ['article:read', 'article:update'],
};

/** Every AuthApi method as a mock, so tests can assert on calls. */
export type FakeApi = { [K in keyof AuthApi]: Mock<AuthApi[K]> };

export function fakeApi(overrides: Partial<AuthApi> = {}): FakeApi {
  return {
    login: vi.fn<AuthApi['login']>(),
    verifyTwoFactor: vi.fn<AuthApi['verifyTwoFactor']>(),
    sendLoginEmailCode: vi
      .fn<AuthApi['sendLoginEmailCode']>()
      .mockResolvedValue(undefined),
    refresh: vi
      .fn<AuthApi['refresh']>()
      .mockRejectedValue(httpError(401, { errorCode: 'AUTH_REQUIRED' })),
    logout: vi.fn<AuthApi['logout']>().mockResolvedValue(undefined),
    me: vi.fn<AuthApi['me']>().mockResolvedValue(TEST_USER),
    ...overrides,
  } as FakeApi;
}

export function httpError(
  status: number,
  data: unknown = {},
  headers: Record<string, string> = {},
): AxiosError {
  const response = {
    status,
    data,
    headers,
    statusText: '',
    config: { headers: new AxiosHeaders() },
  } as AxiosResponse;
  return new AxiosError('failed', undefined, undefined, undefined, response);
}

export function Wrapper({
  api,
  children,
}: {
  api: AuthApi;
  children: ReactNode;
}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <WebSessionProvider api={api}>{children}</WebSessionProvider>
    </QueryClientProvider>
  );
}
