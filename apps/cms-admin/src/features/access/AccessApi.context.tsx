import { createApiContext } from '@apis/client/ApiContext.setup';

import type { AccessApi } from './Access.api';

export const [AccessApiProvider, useAccessApi] = createApiContext<AccessApi>('Access');
