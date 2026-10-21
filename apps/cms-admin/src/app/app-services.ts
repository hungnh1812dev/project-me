import type { QueryClient } from '@tanstack/react-query';
import type { AxiosInstance } from 'axios';

import {
  REFRESH_LOCK_NAME,
  SESSION_CHANNEL_NAME,
} from '../config/auth.constants';
import { createAuthApi } from '../features/auth/auth.api';
import { selectAccessToken } from '../features/auth/auth.slice';
import { createPasswordApi } from '../features/auth/password.api';
import { createSession } from '../features/auth/session';
import { createAccessApi } from '../features/access/access.api';
import { createContentApi } from '../features/content/content.api';
import { createMediaApi } from '../features/media/media.api';
import { createSecurityApi } from '../features/security/security.api';
import { installAuthInterceptor } from '../lib/auth-interceptor';
import { browserCrossTabOptions } from '../lib/cross-tab-refresh';
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
    crossTab: browserCrossTabOptions(REFRESH_LOCK_NAME, SESSION_CHANNEL_NAME),
  });
  const removeInterceptor = installAuthInterceptor(client, {
    getAccessToken: () => selectAccessToken(store.getState()),
    refreshAccessToken: session.refreshAccessToken,
    onSessionExpired: () => session.expire(),
  });
  const passwordApi = createPasswordApi(client);
  const securityApi = createSecurityApi(client);
  const accessApi = createAccessApi(client);
  const contentApi = createContentApi(client);
  const mediaApi = createMediaApi(client);
  return {
    store,
    session,
    passwordApi,
    securityApi,
    accessApi,
    contentApi,
    mediaApi,
    queryClient,
    removeInterceptor,
  };
}

export type AppServices = ReturnType<typeof createAppServices>;
