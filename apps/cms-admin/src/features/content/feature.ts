import { APP_ROUTES } from '../../config/routes';
import { defineApiService, type Feature } from '../../lib/feature-definition';
import { ContentApiProvider } from './content-api-context';
import { createContentApi } from './content.api';
import { CollectionListPage } from './CollectionListPage';
import { DocumentEditPage } from './DocumentEditPage';

export const contentFeature: Feature = {
  apiServices: [defineApiService(createContentApi, ContentApiProvider)],
  routes: [
    { path: APP_ROUTES.CONTENT_LIST, Component: CollectionListPage },
    { path: APP_ROUTES.CONTENT_NEW, Component: DocumentEditPage },
    { path: APP_ROUTES.CONTENT_EDIT, Component: DocumentEditPage },
  ],
};
