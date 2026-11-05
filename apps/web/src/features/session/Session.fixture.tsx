import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios';
import type { Mock } from 'vitest';

import type { AuthApi, CurrentUser } from './Auth.api';
import { WebSessionProvider } from './WebSession.context';

export const TEST_USER: CurrentUser = {
  id: 'acc-1',
  email: 'owner@example.com',
  displayName: 'Mai Owner',
  role: 'viewer',
};

/** Every AuthApi method as a mock, so tests can assert on calls. */
export type FakeApi = { [K in keyof AuthApi]: Mock<AuthApi[K]> };

export function fakeApi(overrides: Partial<AuthApi> = {}): FakeApi {
  return {
    login: vi.fn<AuthApi['login']>(),
    verifyTwoFactor: vi.fn<AuthApi['verifyTwoFactor']>(),
    sendLoginEmailCode: vi.fn<AuthApi['sendLoginEmailCode']>().mockResolvedValue(undefined),
    readSession: vi.fn<AuthApi['readSession']>().mockResolvedValue(null),
    logout: vi.fn<AuthApi['logout']>().mockResolvedValue(undefined),
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

export function Wrapper({ api, children }: { api: AuthApi; children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <WebSessionProvider api={api}>{children}</WebSessionProvider>
    </QueryClientProvider>
  );
}
