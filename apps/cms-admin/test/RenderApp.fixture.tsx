import { QueryClient } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import { App } from '../src/app/App';
import { createAppServices } from '../src/app/AppServices.setup';
import { AppProviders } from '../src/app/AppProviders';
import type { CurrentUser } from '../src/features/auth/auth.slice';
import { API_ENDPOINTS } from '../src/config/Api.endpoints';
import { createApiClient } from '../src/lib/Api.client';
import {
  createFakeApi,
  type FakeHandler,
  TEST_API_BASE_URL,
} from './FakeApi.fixture';

export const TEST_USER: CurrentUser = {
  id: 'acc_owner',
  email: 'owner@domain.localhost',
  displayName: 'Mai Tran',
  role: 'owner',
  twoFactorEnabled: false,
  twoFactorMethod: null,
};

/** App services on a fake API, wired exactly like `main.tsx`. */
export function createTestServices(handlers: Record<string, FakeHandler> = {}) {
  const api = createFakeApi({
    [`GET ${API_ENDPOINTS.HEALTH.LIVE}`]: () => ({
      status: 200,
      data: { status: 'ok' },
    }),
    ...handlers,
  });
  const client = createApiClient(TEST_API_BASE_URL, {
    adapter: api.adapter,
    withCredentials: true,
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return { api, client, services: createAppServices(client, queryClient) };
}

export function renderApp(
  services: ReturnType<typeof createAppServices>,
  route = '/',
) {
  return render(
    <AppProviders services={services}>
      <MemoryRouter initialEntries={[route]}>
        <App />
      </MemoryRouter>
    </AppProviders>,
  );
}
