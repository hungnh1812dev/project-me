import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';

import { appEnv } from '../config/env';
import { authSlice } from '../features/auth/auth.slice';

/** Session and UI state (SPEC §3). Server data lives in TanStack Query. */
export function createAppStore() {
  return configureStore({
    reducer: { [authSlice.reducerPath]: authSlice.reducer },
    // The store holds the access token: no DevTools hook in production builds.
    devTools: appEnv.isDev,
  });
}

export type AppStore = ReturnType<typeof createAppStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];

export const useAppSelector = useSelector.withTypes<RootState>();
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
