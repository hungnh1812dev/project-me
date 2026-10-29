import { APP_ROUTES } from '@configs/App.routes';
import { defineApiService, type Feature } from '@libs/FeatureDefinition';

import { createSecurityApi } from './Security.api';
import { SecurityApiProvider } from './SecurityApi.context';
import { SecuritySettingsPage } from './SecuritySettingsPage';

export const securityFeature: Feature = {
  apiServices: [defineApiService(createSecurityApi, SecurityApiProvider)],
  routes: [{ path: APP_ROUTES.SECURITY_SETTINGS, Component: SecuritySettingsPage }],
};
