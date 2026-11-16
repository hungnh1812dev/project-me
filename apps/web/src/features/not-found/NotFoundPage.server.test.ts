import { executeGraphql } from '@/apis/server/graphql/Graphql.server';
import { NOT_FOUND_PAGE_MOCK } from '@/apis/server/graphql/mocks/NotFoundPage.mock';
import { API_ERROR_CODES, API_ERROR_SOURCES, WebApiError } from '@/apis/WebApi.errors';

import { NOT_FOUND_PAGE_QUERY } from './NotFoundPage.graphql';
import { loadNotFoundText } from './NotFoundPage.server';

vi.mock('../../apis/server/graphql/Graphql.server', () => ({
  executeGraphql: vi.fn<typeof executeGraphql>(),
  requireRootField: () => (data: unknown) => data,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('loadNotFoundText', () => {
  it('asks its query with its mock key', async () => {
    vi.mocked(executeGraphql).mockResolvedValue(NOT_FOUND_PAGE_MOCK);
    await loadNotFoundText();
    expect(executeGraphql).toHaveBeenCalledWith(
      NOT_FOUND_PAGE_QUERY,
      expect.objectContaining({ mock: 'not-found-page' }),
    );
  });

  it('returns the text', async () => {
    vi.mocked(executeGraphql).mockResolvedValue(NOT_FOUND_PAGE_MOCK);
    await expect(loadNotFoundText()).resolves.toEqual(NOT_FOUND_PAGE_MOCK.notFoundText);
  });

  it('returns null when the read failed', async () => {
    vi.mocked(executeGraphql).mockRejectedValue(
      new WebApiError({
        source: API_ERROR_SOURCES.CMS_API_GRAPHQL,
        errorCode: API_ERROR_CODES.GRAPHQL.NO_DATA,
      }),
    );
    await expect(loadNotFoundText()).resolves.toBeNull();
  });

  it('does not hide an unexpected error', async () => {
    vi.mocked(executeGraphql).mockRejectedValue(new TypeError('bug'));
    await expect(loadNotFoundText()).rejects.toThrow(TypeError);
  });
});
