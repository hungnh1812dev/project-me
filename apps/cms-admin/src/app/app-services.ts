import type { QueryClient } from '@tanstack/react-query';
import type { AxiosInstance } from 'axios';

import { createAuthApi } from '../features/auth/auth.api';
import { selectAccessToken } from '../features/auth/auth.slice';
import { createSession } from '../features/auth/session';
import { installAuthInterceptor } from '../lib/auth-interceptor';
import { createAppStore } from './store';

/** Wires store, session and the API client's auth interceptor together. */
export function createAppServices(
  client: AxiosInstance,
  queryClient: QueryClient,
) {
  const store = createAppStore();
  const session = createSession({
    dispatch: store.dispatch,
    authApi: createAuthApi(client),
    onSessionEnded: () => queryClient.clear(),
  });
  const removeInterceptor = installAuthInterceptor(client, {
    getAccessToken: () => selectAccessToken(store.getState()),
    refreshAccessToken: session.refreshAccessToken,
    onSessionExpired: session.expire,
  });
  return { store, session, queryClient, removeInterceptor };
}

export type AppServices = ReturnType<typeof createAppServices>;
