import { APP_ROUTES } from '@configs/App.routes';
import { Navigate, Outlet, useLocation } from 'react-router';

import { selectSessionStatus } from './Auth.slice';
import { SessionLoading } from './SessionLoading';
import { useAuthSelector } from './useAuthSelector';

/** Where to return after signing in; kept in router state, not the URL. */
export interface LoginLocationState {
  from?: string;
}

/** Renders child routes only for a signed-in user. */
export function ProtectedRoute() {
  const status = useAuthSelector(selectSessionStatus);
  const location = useLocation();

  if (status === 'unknown') return <SessionLoading />;
  if (status === 'anonymous') {
    const state: LoginLocationState = {
      from: `${location.pathname}${location.search}`,
    };
    return <Navigate to={APP_ROUTES.LOGIN} replace state={state} />;
  }
  return <Outlet />;
}
