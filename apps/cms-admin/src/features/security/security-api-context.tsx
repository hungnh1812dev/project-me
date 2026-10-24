import { createApiContext } from '../../lib/create-api-context';
import type { SecurityApi } from './security.api';

export const [SecurityApiProvider, useSecurityApi] =
  createApiContext<SecurityApi>('Security');
