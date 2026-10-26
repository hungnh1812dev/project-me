import { createApiContext } from '../../lib/ApiContext.setup';
import type { ContentApi } from './content.api';

export const [ContentApiProvider, useContentApi] =
  createApiContext<ContentApi>('Content');
