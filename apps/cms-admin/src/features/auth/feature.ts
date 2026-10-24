import { APP_ROUTES } from '../../config/routes';
import type { Feature } from '../../lib/feature-definition';
import { LoginPage } from './LoginPage';
import { OwnerSetupPage } from './OwnerSetupPage';
import { ResetPasswordPage } from './ResetPasswordPage';
import { SetPasswordPage } from './SetPasswordPage';

/**
 * The only routes reachable without a session. Every other route sits behind
 * ProtectedRoute, so a new route is protected unless it is added here.
 */
export const PUBLIC_ROUTE_PATHS: readonly string[] = [
  APP_ROUTES.LOGIN,
  APP_ROUTES.SETUP,
  APP_ROUTES.RESET_PASSWORD,
  APP_ROUTES.SET_PASSWORD,
];

export const authFeature: Feature = {
  routes: [
    { path: APP_ROUTES.LOGIN, Component: LoginPage },
    { path: APP_ROUTES.SETUP, Component: OwnerSetupPage },
    { path: APP_ROUTES.RESET_PASSWORD, Component: ResetPasswordPage },
    { path: APP_ROUTES.SET_PASSWORD, Component: SetPasswordPage },
  ],
};
