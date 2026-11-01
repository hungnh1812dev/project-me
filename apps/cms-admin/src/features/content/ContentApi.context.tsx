import { createApiContext } from '@apis/client/ApiContext.setup';

import type { ContentApi } from './Content.api';

export const [ContentApiProvider, useContentApi] = createApiContext<ContentApi>('Content');
