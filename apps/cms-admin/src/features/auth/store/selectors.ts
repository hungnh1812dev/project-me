import { createSelector } from '@reduxjs/toolkit';

import type { AuthState } from '../types';

/** Any state that holds the auth slice (the app `RootState`, or a test stub). */
interface WithAuth {
  auth: AuthState;
}

const NO_PERMISSIONS: readonly string[] = Object.freeze([]);

export const selectAuth = (state: WithAuth): AuthState => state.auth;

export const selectAuthStatus = createSelector(selectAuth, (auth) => auth.status);

export const selectIsAuthenticated = createSelector(
  selectAuthStatus,
  (status) => status === 'authenticated',
);

export const selectCurrentUser = createSelector(selectAuth, (auth) => auth.user);

export const selectRole = createSelector(selectCurrentUser, (user) => user?.role ?? null);

/** The role's permission slugs. A stable empty array when there is no user or no role. */
export const selectPermissions = createSelector(
  selectRole,
  (role): readonly string[] => role?.permissions ?? NO_PERMISSIONS,
);
