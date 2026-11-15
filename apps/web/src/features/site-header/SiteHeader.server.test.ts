import { runContentQuery } from '@/apis/server/graphql/Graphql.server';
import { SITE_HEADER_MOCK } from '@/apis/server/graphql/mocks/SiteHeader.mock';

import { loadSiteHeader } from './SiteHeader.server';

vi.mock('../../apis/server/graphql/Graphql.server', () => ({
  defineContentQuery: (definition: object) => ({ ...definition, document: {} }),
  runContentQuery: vi.fn<typeof runContentQuery>(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('loadSiteHeader', () => {
  it('returns the header with its text', async () => {
    vi.mocked(runContentQuery).mockResolvedValue({ data: SITE_HEADER_MOCK, failedRootFields: [] });
    await expect(loadSiteHeader()).resolves.toEqual(SITE_HEADER_MOCK);
  });

  it('returns null when a root field failed', async () => {
    vi.mocked(runContentQuery).mockResolvedValue({
      data: { header: null },
      failedRootFields: ['header'] as never,
    });
    await expect(loadSiteHeader()).resolves.toBeNull();
  });

  it('returns null when the API answered a root field with null', async () => {
    vi.mocked(runContentQuery).mockResolvedValue({
      data: { ...SITE_HEADER_MOCK, header: null },
      failedRootFields: [],
    });
    await expect(loadSiteHeader()).resolves.toBeNull();
  });
});
