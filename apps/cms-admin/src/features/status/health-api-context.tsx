import { createApiContext } from '../../lib/ApiContext.setup';
import type { HealthApi } from './health.api';

export const [HealthApiProvider, useHealthApi] =
  createApiContext<HealthApi>('Health');
