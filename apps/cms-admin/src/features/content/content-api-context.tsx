import { createApiContext } from '../../lib/create-api-context';
import type { ContentApi } from './content.api';

export const [ContentApiProvider, useContentApi] =
  createApiContext<ContentApi>('Content');
