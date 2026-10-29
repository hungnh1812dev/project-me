import { createApiContext } from '@libs/ApiContext.setup';

import type { BackupsApi } from './Backups.api';

export const [BackupsApiProvider, useBackupsApi] = createApiContext<BackupsApi>('Backups');
