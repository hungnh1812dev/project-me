import { headers } from 'next/headers';

import { executeGraphql } from '@/apis/server/graphql/Graphql.server';
import { SITE_HEADER_MOCK } from '@/apis/server/graphql/mocks/SiteHeader.mock';
import { API_ERROR_CODES, API_ERROR_SOURCES, WebApiError } from '@/apis/WebApi.errors';

import { SITE_HEADER_QUERY } from './SiteHeader.graphql';
import { loadSiteHeader } from './SiteHeader.server';

vi.mock('../../apis/server/graphql/Graphql.server', () => ({
  executeGraphql: vi.fn<typeof executeGraphql>(),
  requireRootField: () => (data: unknown) => data,
}));

vi.mock('next/headers', () => ({ headers: vi.fn<typeof headers>() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(headers).mockImplementation(() => Promise.resolve(new Headers()));
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

  describe('per request', () => {
    const notFound = () =>
      new WebApiError({
        source: API_ERROR_SOURCES.CMS_API_GRAPHQL,
        errorCode: API_ERROR_CODES.GRAPHQL.NO_DATA,
      });

    it('sends one query for two calls with the same headers object', async () => {
      const requestHeaders = new Headers();
      vi.mocked(headers).mockResolvedValue(requestHeaders);
      vi.mocked(executeGraphql).mockResolvedValue(SITE_HEADER_MOCK);
      await loadSiteHeader();
      await loadSiteHeader();
      expect(executeGraphql).toHaveBeenCalledTimes(1);
    });

    it('reuses null when the first read failed', async () => {
      const requestHeaders = new Headers();
      vi.mocked(headers).mockResolvedValue(requestHeaders);
      vi.mocked(executeGraphql).mockRejectedValue(notFound());
      await expect(loadSiteHeader()).resolves.toBeNull();
      await expect(loadSiteHeader()).resolves.toBeNull();
      expect(executeGraphql).toHaveBeenCalledTimes(1);
    });

    it('sends one query per request for different headers objects', async () => {
      vi.mocked(executeGraphql).mockResolvedValue(SITE_HEADER_MOCK);
      await loadSiteHeader();
      await loadSiteHeader();
      expect(executeGraphql).toHaveBeenCalledTimes(2);
    });
  });
});
