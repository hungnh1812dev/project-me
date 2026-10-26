import { createApiContext } from '../../lib/ApiContext.setup';
import type { SecurityApi } from './Security.api';

export const [SecurityApiProvider, useSecurityApi] =
  createApiContext<SecurityApi>('Security');
