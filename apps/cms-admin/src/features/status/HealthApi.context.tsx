import { createApiContext } from '../../lib/ApiContext.setup';
import type { HealthApi } from './Health.api';

export const [HealthApiProvider, useHealthApi] =
  createApiContext<HealthApi>('Health');
