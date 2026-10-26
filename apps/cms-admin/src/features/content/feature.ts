import { APP_ROUTES } from '../../config/App.routes';
import { defineApiService, type Feature } from '../../lib/FeatureDefinition';
import { ContentApiProvider } from './content-api-context';
import { createContentApi } from './content.api';
import { CollectionListPage } from './CollectionListPage';
import { DocumentEditPage } from './DocumentEditPage';
import { useContentNavItems } from './use-content-nav-items';

export const contentFeature: Feature = {
  apiServices: [defineApiService(createContentApi, ContentApiProvider)],
  useNavItems: useContentNavItems,
  routes: [
    { path: APP_ROUTES.CONTENT_LIST, Component: CollectionListPage },
    { path: APP_ROUTES.CONTENT_NEW, Component: DocumentEditPage },
    { path: APP_ROUTES.CONTENT_EDIT, Component: DocumentEditPage },
  ],
};
