import { COPY } from '../../config/copy.constants';
import { APP_ROUTES } from '../../config/routes';
import { defineApiService, type Feature } from '../../lib/feature-definition';
import { MediaApiProvider } from './media-api-context';
import { createMediaApi } from './media.api';
import { MediaLibraryPage } from './MediaLibraryPage';

export const mediaFeature: Feature = {
  apiServices: [defineApiService(createMediaApi, MediaApiProvider)],
  routes: [{ path: APP_ROUTES.MEDIA, Component: MediaLibraryPage }],
  navItems: [
    {
      label: COPY.access.nav.media,
      path: APP_ROUTES.MEDIA,
      subject: 'media',
      action: 'read',
    },
  ],
};
