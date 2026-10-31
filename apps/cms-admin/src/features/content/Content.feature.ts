import { defineApiService } from '@apis/client/ApiService.setup';

import type { Feature } from '../Features.registry';
import { createContentApi } from './Content.api';
import { ContentApiProvider } from './ContentApi.context';

export const contentFeature: Feature = {
  apiServices: [defineApiService(createContentApi, ContentApiProvider)],
};
