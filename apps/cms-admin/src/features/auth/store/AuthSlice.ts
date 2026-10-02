import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { AuthState, AuthStatus, MeUser } from '../types';

export const initialAuthState: AuthState = {
  status: 'idle',
  accessToken: null,
  user: null,
  error: null,
};

function clearSession(state: AuthState): void {
  state.status = 'unauthenticated';
  state.accessToken = null;
  state.user = null;
  state.error = null;
}

const authSlice = createSlice({
  name: 'auth',
  initialState: initialAuthState,
  reducers: {
    tokenReceived: (state, action: PayloadAction<string>) => {
      state.accessToken = action.payload;
    },
    userLoaded: (state, action: PayloadAction<MeUser>) => {
      state.user = action.payload;
      state.status = 'authenticated';
      state.error = null;
    },
    statusChanged: (
      state,
      action: PayloadAction<{ status: AuthStatus; error?: string | null }>,
    ) => {
      state.status = action.payload.status;
      state.error = action.payload.error ?? null;
    },
    /** Local sign-out (logout, or a 401 during bootstrap). */
    sessionCleared: clearSession,
    /** The API client could not recover from a 401. A listener also resets the caches. */
    sessionExpired: clearSession,
  },
});

export const { tokenReceived, userLoaded, statusChanged, sessionCleared, sessionExpired } =
  authSlice.actions;
export default authSlice.reducer;
