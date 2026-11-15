import { runContentQuery } from '@/apis/server/graphql/Graphql.server';
import { NOT_FOUND_PAGE_MOCK } from '@/apis/server/graphql/mocks/NotFoundPage.mock';

import { loadNotFoundText } from './NotFoundPage.server';

vi.mock('../../apis/server/graphql/Graphql.server', () => ({
  defineContentQuery: (definition: object) => ({ ...definition, document: {} }),
  runContentQuery: vi.fn<typeof runContentQuery>(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('loadNotFoundText', () => {
  it('returns the text', async () => {
    vi.mocked(runContentQuery).mockResolvedValue({
      data: NOT_FOUND_PAGE_MOCK,
      failedRootFields: [],
    });
    await expect(loadNotFoundText()).resolves.toEqual(NOT_FOUND_PAGE_MOCK.notFoundText);
  });

  it('returns null when the root field failed', async () => {
    vi.mocked(runContentQuery).mockResolvedValue({
      data: { notFoundText: null },
      failedRootFields: ['notFoundText'] as never,
    });
    await expect(loadNotFoundText()).resolves.toBeNull();
  });

  it('returns null when the API answered the root field with null', async () => {
    vi.mocked(runContentQuery).mockResolvedValue({
      data: { notFoundText: null },
      failedRootFields: [],
    });
    await expect(loadNotFoundText()).resolves.toBeNull();
  });
});
