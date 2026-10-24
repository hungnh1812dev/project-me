import { APP_ROUTES } from '../../config/routes';
import type { Feature } from '../../lib/feature-definition';
import { CollectionListPage } from './CollectionListPage';
import { DocumentEditPage } from './DocumentEditPage';

export const contentFeature: Feature = {
  routes: [
    { path: APP_ROUTES.CONTENT_LIST, Component: CollectionListPage },
    { path: APP_ROUTES.CONTENT_NEW, Component: DocumentEditPage },
    { path: APP_ROUTES.CONTENT_EDIT, Component: DocumentEditPage },
  ],
};
