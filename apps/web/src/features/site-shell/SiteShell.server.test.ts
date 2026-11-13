import { runContentQuery } from '@/apis/server/graphql/Graphql.server';
import { SITE_SHELL_MOCK } from '@/apis/server/graphql/mocks/SiteShell.mock';
import { WebApiError } from '@/apis/WebApi.errors';

import { loadSiteShell } from './SiteShell.server';

vi.mock('../../apis/server/graphql/Graphql.server', () => ({
  defineContentQuery: (definition: object) => ({ ...definition, document: {} }),
  runContentQuery: vi.fn<typeof runContentQuery>(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('loadSiteShell', () => {
  it('returns the header and both text sets', async () => {
    vi.mocked(runContentQuery).mockResolvedValue({
      data: SITE_SHELL_MOCK,
      failedRootFields: [],
    });
    await expect(loadSiteShell()).resolves.toEqual(SITE_SHELL_MOCK);
  });

  it('throws WebApiError NO_DATA when a root field failed', async () => {
    vi.mocked(runContentQuery).mockResolvedValue({
      data: { ...SITE_SHELL_MOCK, signInText: null },
      failedRootFields: ['signInText'] as never,
    });
    await expect(loadSiteShell()).rejects.toMatchObject({
      errorCode: 'NO_DATA',
      source: 'cms-api-graphql',
    });
    await expect(loadSiteShell()).rejects.toBeInstanceOf(WebApiError);
  });
});
