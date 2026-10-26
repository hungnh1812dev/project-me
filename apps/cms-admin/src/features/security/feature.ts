import { APP_ROUTES } from '../../config/App.routes';
import { defineApiService, type Feature } from '../../lib/FeatureDefinition';
import { SecurityApiProvider } from './security-api-context';
import { createSecurityApi } from './security.api';
import { SecuritySettingsPage } from './SecuritySettingsPage';

export const securityFeature: Feature = {
  apiServices: [defineApiService(createSecurityApi, SecurityApiProvider)],
  routes: [
    { path: APP_ROUTES.SECURITY_SETTINGS, Component: SecuritySettingsPage },
  ],
};
