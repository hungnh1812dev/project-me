import { createApiContext } from '../../lib/ApiContext.setup';
import type { BackupsApi } from './Backups.api';

export const [BackupsApiProvider, useBackupsApi] =
  createApiContext<BackupsApi>('Backups');
