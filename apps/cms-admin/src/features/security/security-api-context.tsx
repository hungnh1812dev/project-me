import { createApiContext } from '../../lib/ApiContext.setup';
import type { SecurityApi } from './security.api';

export const [SecurityApiProvider, useSecurityApi] =
  createApiContext<SecurityApi>('Security');
