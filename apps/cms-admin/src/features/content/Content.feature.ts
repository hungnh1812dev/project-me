import { APP_ROUTES } from '../../config/App.routes';
import { defineApiService, type Feature } from '../../lib/FeatureDefinition';
import { ContentApiProvider } from './ContentApi.context';
import { createContentApi } from './Content.api';
import { CollectionListPage } from './CollectionListPage';
import { DocumentEditPage } from './DocumentEditPage';
import { useContentNavItems } from './useContentNavItems.query';

export const contentFeature: Feature = {
  apiServices: [defineApiService(createContentApi, ContentApiProvider)],
  useNavItems: useContentNavItems,
  routes: [
    { path: APP_ROUTES.CONTENT_LIST, Component: CollectionListPage },
    { path: APP_ROUTES.CONTENT_NEW, Component: DocumentEditPage },
    { path: APP_ROUTES.CONTENT_EDIT, Component: DocumentEditPage },
  ],
};
