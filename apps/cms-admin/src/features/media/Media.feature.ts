import { defineApiService } from '@apis/client/ApiService.setup';

import type { Feature } from '../Features.registry';
import { createMediaApi } from './Media.api';
import { MediaApiProvider } from './MediaApi.context';

export const mediaFeature: Feature = {
  apiServices: [defineApiService(createMediaApi, MediaApiProvider)],
};
