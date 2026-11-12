import { runContentQuery } from '@/apis/server/graphql/Graphql.server';
import { STATUS_PAGE_MOCK } from '@/apis/server/restful/mocks/StatusPage.mock';

import { loadStatusPage } from './StatusPage.server';

vi.mock('../../apis/server/graphql/Graphql.server', () => ({
  defineContentQuery: (definition: object) => ({ ...definition, document: {} }),
  runContentQuery: vi.fn<typeof runContentQuery>(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('loadStatusPage', () => {
  it('returns the page text', async () => {
    vi.mocked(runContentQuery).mockResolvedValue({ data: STATUS_PAGE_MOCK, failedRootFields: [] });
    await expect(loadStatusPage()).resolves.toEqual(STATUS_PAGE_MOCK.statusPageText);
  });

  it('returns null when statusPageText failed', async () => {
    vi.mocked(runContentQuery).mockResolvedValue({
      data: { statusPageText: null },
      failedRootFields: ['statusPageText'] as never,
    });
    await expect(loadStatusPage()).resolves.toBeNull();
  });
});
