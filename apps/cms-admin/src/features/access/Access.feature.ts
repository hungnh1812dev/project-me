import { defineApiService } from '@apis/client/ApiService.setup';

import type { Feature } from '../Features.registry';
import { createAccessApi } from './Access.api';
import { AccessApiProvider } from './AccessApi.context';

export const accessFeature: Feature = {
  apiServices: [defineApiService(createAccessApi, AccessApiProvider)],
};
