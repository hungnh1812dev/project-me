import { describeContentQueryContract } from '@/apis/server/graphql/ContentQuery.fixture';
import { MOCK_VIEW } from '@/apis/server/graphql/mocks/MockView';
import { NOT_FOUND_PAGE_MOCK } from '@/apis/server/graphql/mocks/NotFoundPage.mock';

import { NOT_FOUND_PAGE_OPERATION_NAME, NOT_FOUND_PAGE_ROOT_FIELDS } from './NotFoundPage.graphql';
import { NOT_FOUND_PAGE_QUERY } from './NotFoundPage.server';

describeContentQueryContract({
  operationName: NOT_FOUND_PAGE_OPERATION_NAME,
  queryText: NOT_FOUND_PAGE_QUERY.document.query,
  rootFields: NOT_FOUND_PAGE_ROOT_FIELDS,
  mock: NOT_FOUND_PAGE_MOCK,
  mockView: MOCK_VIEW,
});
