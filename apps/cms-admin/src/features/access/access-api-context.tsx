import { createApiContext } from '../../lib/ApiContext.setup';
import type { AccessApi } from './access.api';

export const [AccessApiProvider, useAccessApi] =
  createApiContext<AccessApi>('Access');
