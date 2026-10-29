import { APP_ROUTES } from '@configs/App.routes';
import { defineApiService, type Feature } from '@libs/FeatureDefinition';

import { CollectionListPage } from './CollectionListPage';
import { createContentApi } from './Content.api';
import { ContentApiProvider } from './ContentApi.context';
import { DocumentEditPage } from './DocumentEditPage';
import { useContentNavItems } from './useContentNavItems';

export const contentFeature: Feature = {
  apiServices: [defineApiService(createContentApi, ContentApiProvider)],
  useNavItems: useContentNavItems,
  routes: [
    { path: APP_ROUTES.CONTENT_LIST, Component: CollectionListPage },
    { path: APP_ROUTES.CONTENT_NEW, Component: DocumentEditPage },
    { path: APP_ROUTES.CONTENT_EDIT, Component: DocumentEditPage },
  ],
};
