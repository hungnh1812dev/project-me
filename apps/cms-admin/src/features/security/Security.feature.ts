import { defineApiService } from '@apis/client/ApiService.setup';

import type { Feature } from '../Features.registry';
import { createSecurityApi } from './Security.api';
import { SecurityApiProvider } from './SecurityApi.context';

export const securityFeature: Feature = {
  apiServices: [defineApiService(createSecurityApi, SecurityApiProvider)],
};
