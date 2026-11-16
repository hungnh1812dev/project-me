import { describeContentQueryContract } from '@/apis/server/graphql/ContentQuery.fixture';
import { MOCK_VIEW } from '@/apis/server/graphql/mocks/MockView';

import { MODULE_STATUS_QUERY } from './ModuleStatus.graphql';

describeContentQueryContract({
  query: MODULE_STATUS_QUERY,
  mockKey: 'module-status',
  mockView: MOCK_VIEW,
});
