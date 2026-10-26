import type { QueryClient } from '@tanstack/react-query';
import type { AxiosInstance } from 'axios';

import {
  REFRESH_LOCK_NAME,
  SESSION_CHANNEL_NAME,
} from '../config/Auth.constants';
import {
  accessTokenOf,
  createAuthApi,
  browserCrossTabOptions,
  createSession,
  installAuthInterceptor,
} from '../features/auth/AuthWiring.setup';
import { FEATURE_LIST } from '../features/registry';
import { createAppStore } from './App.store';

/** Wires store, session, every feature API and the client's auth interceptor. */
export function createAppServices(
  client: AxiosInstance,
  queryClient: QueryClient,
) {
  const store = createAppStore();
  const session = createSession({
    dispatch: store.dispatch,
    authApi: createAuthApi(client),
    onSessionEnded: () => queryClient.clear(),
    crossTab: browserCrossTabOptions(REFRESH_LOCK_NAME, SESSION_CHANNEL_NAME),
  });
  const removeInterceptor = installAuthInterceptor(client, {
    getAccessToken: () => accessTokenOf(store.getState()),
    refreshAccessToken: session.refreshAccessToken,
    onSessionExpired: () => session.expire(),
  });
  const apiProviders = FEATURE_LIST.flatMap(
    (feature) => feature.apiServices ?? [],
  ).map((service) => service.provideFor(client));
  return { store, session, apiProviders, queryClient, removeInterceptor };
}

export type AppServices = ReturnType<typeof createAppServices>;
