import { createApiContext } from '@libs/ApiContext.setup';

import type { MediaApi } from './Media.api';

export const [MediaApiProvider, useMediaApi] = createApiContext<MediaApi>('Media');
