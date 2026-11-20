import { describeContentQueryContract } from '@/apis/server/graphql/ContentQuery.fixture';
import { MOCK_VIEW } from '@/apis/server/graphql/mocks/MockView';

import { SITE_HEADER_QUERY } from './SiteHeader.graphql';

describeContentQueryContract({
  query: SITE_HEADER_QUERY,
  mockKey: 'site-header',
  mockView: MOCK_VIEW,
  emptyMockPathPrefixes: ['header.navs.subNavs.'],
});

describe('SiteHeader selection', () => {
  it('selects the nav and sub nav fields the header reads', () => {
    for (const field of ['title', 'link', 'subNavs']) {
      expect(SITE_HEADER_QUERY).toContain(field);
    }
    expect(SITE_HEADER_QUERY).not.toMatch(/requires/i);
  });
});
