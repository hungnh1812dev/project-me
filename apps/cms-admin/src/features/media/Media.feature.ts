import { APP_ROUTES } from '../../config/App.routes';
import { COPY } from '../../config/Copy.constants';
import { defineApiService, type Feature } from '../../lib/FeatureDefinition';
import { createMediaApi } from './Media.api';
import { MediaApiProvider } from './MediaApi.context';
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
