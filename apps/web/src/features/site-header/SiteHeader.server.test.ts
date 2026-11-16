import { executeGraphql } from '@/apis/server/graphql/Graphql.server';
import { SITE_HEADER_MOCK } from '@/apis/server/graphql/mocks/SiteHeader.mock';
import { API_ERROR_CODES, API_ERROR_SOURCES, WebApiError } from '@/apis/WebApi.errors';

import { SITE_HEADER_QUERY } from './SiteHeader.graphql';
import { loadSiteHeader } from './SiteHeader.server';

vi.mock('../../apis/server/graphql/Graphql.server', () => ({
  executeGraphql: vi.fn<typeof executeGraphql>(),
  requireRootField: () => (data: unknown) => data,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('loadSiteHeader', () => {
  it('asks its query with its mock key', async () => {
    vi.mocked(executeGraphql).mockResolvedValue(SITE_HEADER_MOCK);
    await loadSiteHeader();
    expect(executeGraphql).toHaveBeenCalledWith(
      SITE_HEADER_QUERY,
      expect.objectContaining({ mock: 'site-header' }),
    );
  });

  it('returns the header', async () => {
    vi.mocked(executeGraphql).mockResolvedValue(SITE_HEADER_MOCK);
    await expect(loadSiteHeader()).resolves.toEqual(SITE_HEADER_MOCK);
  });

  it('returns null when the read failed', async () => {
    vi.mocked(executeGraphql).mockRejectedValue(
      new WebApiError({
        source: API_ERROR_SOURCES.CMS_API_GRAPHQL,
        errorCode: API_ERROR_CODES.GRAPHQL.NO_DATA,
      }),
    );
    await expect(loadSiteHeader()).resolves.toBeNull();
  });

  it('does not hide an unexpected error', async () => {
    vi.mocked(executeGraphql).mockRejectedValue(new TypeError('bug'));
    await expect(loadSiteHeader()).rejects.toThrow(TypeError);
  });
});
