import { configureStore } from '@reduxjs/toolkit';

import { authSlice } from './auth.slice';

/** A store holding only auth state, for tests that must not depend on `app/`. */
export function createAuthTestStore() {
  return configureStore({
    reducer: { [authSlice.reducerPath]: authSlice.reducer },
  });
}
