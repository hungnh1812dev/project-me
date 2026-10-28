import { APP_ROUTES } from '../../config/App.routes';
import { defineApiService, type Feature } from '../../lib/FeatureDefinition';
import { SecurityApiProvider } from './SecurityApi.context';
import { createSecurityApi } from './Security.api';
import { SecuritySettingsPage } from './SecuritySettingsPage';

export const securityFeature: Feature = {
  apiServices: [defineApiService(createSecurityApi, SecurityApiProvider)],
  routes: [
    { path: APP_ROUTES.SECURITY_SETTINGS, Component: SecuritySettingsPage },
  ],
};
