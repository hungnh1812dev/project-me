import { createApiContext } from '../../lib/create-api-context';
import type { AccessApi } from './access.api';

export const [AccessApiProvider, useAccessApi] =
  createApiContext<AccessApi>('Access');
