import { createApiContext } from '@libs/ApiContext.setup';

import type { PasswordApi } from './Password.api';

export const [PasswordApiProvider, usePasswordApi] = createApiContext<PasswordApi>('Password');
