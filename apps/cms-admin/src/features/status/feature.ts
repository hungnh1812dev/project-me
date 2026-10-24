import { defineApiService, type Feature } from '../../lib/feature-definition';
import { HealthApiProvider } from './health-api-context';
import { createHealthApi } from './health.api';
import { StatusPage } from './StatusPage';

export const statusFeature: Feature = {
  apiServices: [defineApiService(createHealthApi, HealthApiProvider)],
  routes: [{ Component: StatusPage }],
};
