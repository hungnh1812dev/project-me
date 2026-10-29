import { defineApiService, type Feature } from '../../lib/FeatureDefinition';
import { createHealthApi } from './Health.api';
import { HealthApiProvider } from './HealthApi.context';
import { StatusPage } from './StatusPage';

export const statusFeature: Feature = {
  apiServices: [defineApiService(createHealthApi, HealthApiProvider)],
  routes: [{ Component: StatusPage }],
};
