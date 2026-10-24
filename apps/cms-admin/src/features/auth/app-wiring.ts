import { authSlice, selectAccessToken } from './auth.slice';
import type { AuthRootState } from './auth-hooks';

/**
 * Entry for `src/app/**` only (lint-enforced): what composing the store,
 * the session and the API client needs. Features use `./index.ts`.
 */
export { createAuthApi } from './auth.api';
export { browserCrossTabOptions } from './cross-tab-refresh';
export { installAuthInterceptor } from './auth-interceptor';
export { createSession } from './session';

/** Reducer map, so the state key stays owned by auth. */
export const authReducer = { [authSlice.reducerPath]: authSlice.reducer };

export const accessTokenOf = (state: AuthRootState) => selectAccessToken(state);
