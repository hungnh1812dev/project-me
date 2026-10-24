import { createApiContext } from '../../lib/create-api-context';
import type { HealthApi } from './health.api';

export const [HealthApiProvider, useHealthApi] =
  createApiContext<HealthApi>('Health');
