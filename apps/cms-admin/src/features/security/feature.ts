import { APP_ROUTES } from '../../config/routes';
import { defineApiService, type Feature } from '../../lib/feature-definition';
import { SecurityApiProvider } from './security-api-context';
import { createSecurityApi } from './security.api';
import { SecuritySettingsPage } from './SecuritySettingsPage';

export const securityFeature: Feature = {
  apiServices: [defineApiService(createSecurityApi, SecurityApiProvider)],
  routes: [
    { path: APP_ROUTES.SECURITY_SETTINGS, Component: SecuritySettingsPage },
  ],
};
