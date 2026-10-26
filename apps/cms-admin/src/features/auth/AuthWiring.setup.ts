import { authSlice, selectAccessToken } from './Auth.slice';
import type { AuthRootState } from './useAuthSelector.state';

/**
 * Entry for `src/app/**` only (lint-enforced): what composing the store,
 * the session and the API client needs. Features use `./index.ts`.
 */
export { createAuthApi } from './Auth.api';
export { browserCrossTabOptions } from './CrossTabRefresh';
export { installAuthInterceptor } from './Auth.interceptor';
export { createSession } from './Session';

/** Reducer map, so the state key stays owned by auth. */
export const authReducer = { [authSlice.reducerPath]: authSlice.reducer };

export const accessTokenOf = (state: AuthRootState) => selectAccessToken(state);
