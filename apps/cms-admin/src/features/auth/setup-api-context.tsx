import { createApiContext } from '../../lib/ApiContext.setup';
import type { SetupApi } from './setup.api';

export const [SetupApiProvider, useSetupApi] =
  createApiContext<SetupApi>('Setup');
