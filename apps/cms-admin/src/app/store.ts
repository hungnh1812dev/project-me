import {
  configureStore,
  createListenerMiddleware,
  type ThunkAction,
  type UnknownAction,
} from '@reduxjs/toolkit';
import type { QueryClient } from '@tanstack/react-query';

import { authApi } from '@/core/api/AuthApi';
import { configureCmsApi } from '@/core/api/CmsApi';
import authReducer, {
  initialAuthState,
  sessionExpired,
  tokenReceived,
} from '@/features/auth/store/AuthSlice';
import type { AuthState } from '@/features/auth/types';

import { queryClient as sharedQueryClient } from './queryClient';

/** Passed to every thunk and listener as the extra argument. */
export interface StoreExtra {
  queryClient: QueryClient;
}

export interface MakeStoreOptions {
  /** Defaults to the app's shared `queryClient`. Tests pass a fresh one. */
  queryClient?: QueryClient;
  /** Merged over the initial auth state. */
  preloadedAuth?: Partial<AuthState>;
}

/**
 * Builds a store and wires `cmsApi` to it (bearer getter, refreshed token, session expiry). The
 * last store built owns `cmsApi`: the app builds one, and each test builds its own.
 */
export function makeStore({
  queryClient = sharedQueryClient,
  preloadedAuth,
}: MakeStoreOptions = {}) {
  const extra: StoreExtra = { queryClient };
  const listener = createListenerMiddleware({ extra });

  const store = configureStore({
    reducer: { auth: authReducer, [authApi.reducerPath]: authApi.reducer },
    preloadedState: { auth: { ...initialAuthState, ...preloadedAuth } },
    middleware: (getDefault) =>
      getDefault({ thunk: { extraArgument: extra } })
        .prepend(listener.middleware)
        .concat(authApi.middleware),
    devTools: import.meta.env.DEV,
  });

  // AC-16: no data from the previous user survives an expired session.
  listener.startListening({
    actionCreator: sessionExpired,
    effect: (_action, api) => {
      api.dispatch(authApi.util.resetApiState());
      api.extra.queryClient.clear();
    },
  });

  configureCmsApi({
    getAccessToken: () => store.getState().auth.accessToken,
    onTokenRefreshed: (token) => store.dispatch(tokenReceived(token)),
    onSessionExpired: () => store.dispatch(sessionExpired()),
  });

  return store;
}

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
export type AppThunk<R = void> = ThunkAction<R, RootState, StoreExtra, UnknownAction>;

/** The app's store. Its auth slice lives in memory only and is never persisted. */
export const store = makeStore();
