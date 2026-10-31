import { defineApiService } from '@apis/client/ApiService.setup';

import type { Feature } from '../Features.registry';
import { createBackupsApi } from './Backups.api';
import { BackupsApiProvider } from './BackupsApi.context';

export const backupsFeature: Feature = {
  apiServices: [defineApiService(createBackupsApi, BackupsApiProvider)],
};
