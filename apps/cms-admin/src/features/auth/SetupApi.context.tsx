import { createApiContext } from '@libs/ApiContext.setup';

import type { SetupApi } from './Setup.api';

export const [SetupApiProvider, useSetupApi] = createApiContext<SetupApi>('Setup');
