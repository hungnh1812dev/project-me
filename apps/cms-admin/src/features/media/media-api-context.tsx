import { createApiContext } from '../../lib/ApiContext.setup';
import type { MediaApi } from './media.api';

export const [MediaApiProvider, useMediaApi] =
  createApiContext<MediaApi>('Media');
