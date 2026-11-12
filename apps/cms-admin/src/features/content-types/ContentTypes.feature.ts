import { defineApiService } from '@apis/client/ApiService.setup';

import type { Feature } from '../Features.registry';
import { createContentTypesApi } from './ContentTypes.api';
import { ContentTypesApiProvider } from './ContentTypesApi.context';

export const contentTypesFeature: Feature = {
  apiServices: [defineApiService(createContentTypesApi, ContentTypesApiProvider)],
};
