import { defineApiService, type Feature } from '../../lib/FeatureDefinition';
import { HealthApiProvider } from './HealthApi.context';
import { createHealthApi } from './Health.api';
import { StatusPage } from './StatusPage';

export const statusFeature: Feature = {
  apiServices: [defineApiService(createHealthApi, HealthApiProvider)],
  routes: [{ Component: StatusPage }],
};
