import { describeContentQueryContract } from '@/apis/server/graphql/ContentQuery.fixture';
import { MOCK_VIEW } from '@/apis/server/graphql/mocks/MockView';
import { SITE_HEADER_MOCK } from '@/apis/server/graphql/mocks/SiteHeader.mock';

import { SITE_HEADER_OPERATION_NAME, SITE_HEADER_ROOT_FIELDS } from './SiteHeader.graphql';
import { SITE_HEADER_QUERY } from './SiteHeader.server';

// `nav` is empty in the mock, so its item fields are checked one way only (below).
describeContentQueryContract({
  operationName: SITE_HEADER_OPERATION_NAME,
  queryText: SITE_HEADER_QUERY.document.query,
  rootFields: SITE_HEADER_ROOT_FIELDS,
  mock: SITE_HEADER_MOCK,
  mockView: MOCK_VIEW,
  emptyMockPathPrefixes: ['header.nav.'],
});

describe('SiteHeader selection', () => {
  it('selects the nav item fields the header reads', () => {
    const { query } = SITE_HEADER_QUERY.document;
    for (const field of ['title', 'link', 'requiresRole', 'subNavigations']) {
      expect(query).toContain(field);
    }
  });
});
