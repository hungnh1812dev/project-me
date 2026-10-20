import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

/** `GET /auth/me` (SPEC §9). */
export interface CurrentUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
  twoFactorEnabled: boolean;
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
}

const initialState: AuthState = {
  status: 'unknown',
  accessToken: null,
  user: null,
};

const anonymous: AuthState = {
  status: 'anonymous',
  accessToken: null,
  user: null,
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
    },
    /** Sign-out, a failed refresh, or no session on app start. */
    signedOut() {
      return anonymous;
    },
  },
  selectors: {
    selectSessionStatus: (state) => state.status,
    selectAccessToken: (state) => state.accessToken,
    selectCurrentUser: (state) => state.user,
  },
});

export const { accessTokenReceived, signedIn, signedOut } = authSlice.actions;
export const { selectSessionStatus, selectAccessToken, selectCurrentUser } =
  authSlice.selectors;
