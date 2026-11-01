import { defineApiService } from '@apis/client/ApiService.setup';

import type { Feature } from '../Features.registry';
import { createHealthApi } from './Health.api';
import { HealthApiProvider } from './HealthApi.context';

export const statusFeature: Feature = {
  apiServices: [defineApiService(createHealthApi, HealthApiProvider)],
};
