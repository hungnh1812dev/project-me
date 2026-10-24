import { useSelector } from 'react-redux';

import { authSlice, type AuthState } from './auth.slice';

/** The slice of the app state auth owns; the app store satisfies it by construction. */
export type AuthRootState = Record<typeof authSlice.reducerPath, AuthState>;

export const useAuthSelector = useSelector.withTypes<AuthRootState>();
