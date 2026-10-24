import { APP_ROUTES } from '../../config/routes';
import type { Feature } from '../../lib/feature-definition';
import { SecuritySettingsPage } from './SecuritySettingsPage';

export const securityFeature: Feature = {
  routes: [
    { path: APP_ROUTES.SECURITY_SETTINGS, Component: SecuritySettingsPage },
  ],
};
