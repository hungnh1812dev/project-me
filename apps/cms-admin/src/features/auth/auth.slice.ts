import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { TwoFactorMethod } from '../../config/Auth.constants';
import type { LoginNotice } from './login-notice';

/** `GET /auth/me` (SPEC §9). */
export interface CurrentUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
  twoFactorEnabled: boolean;
  /** Null while 2FA is off. */
  twoFactorMethod: TwoFactorMethod | null;
}

/**
 * `unknown` until the silent refresh on app start settles, so protected
 * pages show a loading state instead of flashing the login page.
 */
export type SessionStatus = 'unknown' | 'authenticated' | 'anonymous';

export interface AuthState {
  status: SessionStatus;
  /** In memory only (D14): never persisted, never in browser storage. */
  accessToken: string | null;
  user: CurrentUser | null;
  /** Why the session ended, shown once on the sign-in page (e.g. password changed). */
  endNotice: LoginNotice | null;
}

const initialState: AuthState = {
  status: 'unknown',
  accessToken: null,
  user: null,
  endNotice: null,
};

export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    /** A token from login or refresh, before /me has answered. */
    accessTokenReceived(state, action: PayloadAction<string>) {
      state.accessToken = action.payload;
    },
    signedIn(state, action: PayloadAction<CurrentUser>) {
      state.status = 'authenticated';
      state.user = action.payload;
      state.endNotice = null;
    },
    /**
     * Sign-out, a failed refresh, or no session on app start. The optional
     * notice tells the sign-in page why (it survives the route guard's redirect).
     */
    signedOut(_state, action: PayloadAction<LoginNotice | undefined>) {
      return {
        status: 'anonymous',
        accessToken: null,
        user: null,
        endNotice: action.payload ?? null,
      } satisfies AuthState;
    },
  },
  selectors: {
    selectSessionStatus: (state) => state.status,
    selectAccessToken: (state) => state.accessToken,
    selectCurrentUser: (state) => state.user,
    selectEndNotice: (state) => state.endNotice,
  },
});

export const { accessTokenReceived, signedIn, signedOut } = authSlice.actions;
export const {
  selectSessionStatus,
  selectAccessToken,
  selectCurrentUser,
  selectEndNotice,
} = authSlice.selectors;
