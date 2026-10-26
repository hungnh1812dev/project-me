import { createApiContext } from '../../lib/ApiContext.setup';
import type { AccessApi } from './Access.api';

export const [AccessApiProvider, useAccessApi] =
  createApiContext<AccessApi>('Access');
