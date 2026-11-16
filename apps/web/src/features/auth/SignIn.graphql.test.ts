import { describeContentQueryContract } from '@/apis/server/graphql/ContentQuery.fixture';
import { MOCK_VIEW } from '@/apis/server/graphql/mocks/MockView';

import { SIGN_IN_QUERY } from './SignIn.graphql';

describeContentQueryContract({
  query: SIGN_IN_QUERY,
  mockKey: 'sign-in',
  mockView: MOCK_VIEW,
});
