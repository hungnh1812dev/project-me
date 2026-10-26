import { configureStore } from '@reduxjs/toolkit';

import { appEnv } from '../config/App.env';
import { authReducer } from '../features/auth/app-wiring';

/** Session and UI state (SPEC §3). Server data lives in TanStack Query. */
export function createAppStore() {
  return configureStore({
    reducer: { ...authReducer },
    // The store holds the access token: no DevTools hook in production builds.
    devTools: appEnv.isDev,
  });
}

export type AppStore = ReturnType<typeof createAppStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
