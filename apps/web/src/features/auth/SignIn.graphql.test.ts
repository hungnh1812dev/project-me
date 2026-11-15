import { describeContentQueryContract } from '@/apis/server/graphql/ContentQuery.fixture';
import { MOCK_VIEW } from '@/apis/server/graphql/mocks/MockView';
import { SIGN_IN_MOCK } from '@/apis/server/graphql/mocks/SignIn.mock';

import { SIGN_IN_OPERATION_NAME, SIGN_IN_ROOT_FIELDS } from './SignIn.graphql';
import { SIGN_IN_QUERY } from './SignIn.server';

describeContentQueryContract({
  operationName: SIGN_IN_OPERATION_NAME,
  queryText: SIGN_IN_QUERY.document.query,
  rootFields: SIGN_IN_ROOT_FIELDS,
  mock: SIGN_IN_MOCK,
  mockView: MOCK_VIEW,
});
