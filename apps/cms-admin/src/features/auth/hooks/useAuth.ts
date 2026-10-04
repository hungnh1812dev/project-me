import { useCallback } from 'react';

import { useAppDispatch, useAppSelector } from '@/app/hooks';

import {
  selectAuthStatus,
  selectCurrentUser,
  selectPermissions,
  selectRole,
} from '../store/selectors';
import {
  login as loginThunk,
  logout as logoutThunk,
  retryBootstrap as retryBootstrapThunk,
} from '../store/sessionThunks';
import type { LoginRequest } from '../types';

/** The session state and actions, for pages and guards. */
export function useAuth() {
  const dispatch = useAppDispatch();
  const status = useAppSelector(selectAuthStatus);
  const user = useAppSelector(selectCurrentUser);
  const role = useAppSelector(selectRole);
  const permissions = useAppSelector(selectPermissions);

  const login = useCallback(
    (credentials: LoginRequest) => dispatch(loginThunk(credentials)),
    [dispatch],
  );
  const logout = useCallback(() => dispatch(logoutThunk()), [dispatch]);
  const retryBootstrap = useCallback(() => dispatch(retryBootstrapThunk()), [dispatch]);

  return { status, user, role, permissions, login, logout, retryBootstrap };
}
