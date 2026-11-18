import { createApiContext } from '@apis/client/ApiContext.setup';

import type { ContentTypesApi } from './ContentTypes.api';

export const [ContentTypesApiProvider, useContentTypesApi] =
  createApiContext<ContentTypesApi>('ContentTypes');
