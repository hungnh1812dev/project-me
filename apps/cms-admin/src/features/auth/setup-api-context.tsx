import { createApiContext } from '../../lib/create-api-context';
import type { SetupApi } from './setup.api';

export const [SetupApiProvider, useSetupApi] =
  createApiContext<SetupApi>('Setup');
