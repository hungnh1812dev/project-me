import { COPY } from '../../config/copy.constants';
import { APP_ROUTES } from '../../config/routes';
import type { Feature } from '../../lib/feature-definition';
import { MediaLibraryPage } from './MediaLibraryPage';

export const mediaFeature: Feature = {
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
