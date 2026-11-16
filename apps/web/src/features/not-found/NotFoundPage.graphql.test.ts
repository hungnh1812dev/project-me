import { describeContentQueryContract } from '@/apis/server/graphql/ContentQuery.fixture';
import { MOCK_VIEW } from '@/apis/server/graphql/mocks/MockView';

import { NOT_FOUND_PAGE_QUERY } from './NotFoundPage.graphql';

describeContentQueryContract({
  query: NOT_FOUND_PAGE_QUERY,
  mockKey: 'not-found-page',
  mockView: MOCK_VIEW,
});
