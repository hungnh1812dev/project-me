import { createApiContext } from '@apis/client/ApiContext.setup';

import type { PasswordApi } from './Password.api';

export const [PasswordApiProvider, usePasswordApi] = createApiContext<PasswordApi>('Password');
