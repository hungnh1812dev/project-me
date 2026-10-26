import { COPY } from '../../config/Copy.constants';
import { APP_ROUTES } from '../../config/App.routes';
import { defineApiService, type Feature } from '../../lib/FeatureDefinition';
import { MediaApiProvider } from './MediaApi.context';
import { createMediaApi } from './Media.api';
import { MediaLibraryPage } from './MediaLibraryPage';

export const mediaFeature: Feature = {
  apiServices: [defineApiService(createMediaApi, MediaApiProvider)],
  routes: [{ path: APP_ROUTES.MEDIA, Component: MediaLibraryPage }],
  navItems: [
    {
      label: COPY.access.nav.media,
      path: APP_ROUTES.MEDIA,
      section: 'utilities',
      subject: 'media',
      action: 'read',
    },
  ],
};
