import { createApiContext } from '@apis/client/ApiContext.setup';

import type { SecurityApi } from './Security.api';

export const [SecurityApiProvider, useSecurityApi] = createApiContext<SecurityApi>('Security');
