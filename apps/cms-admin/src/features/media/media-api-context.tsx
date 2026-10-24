import { createApiContext } from '../../lib/create-api-context';
import type { MediaApi } from './media.api';

export const [MediaApiProvider, useMediaApi] =
  createApiContext<MediaApi>('Media');
