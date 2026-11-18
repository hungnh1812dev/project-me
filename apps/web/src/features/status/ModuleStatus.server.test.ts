import { executeGraphql } from '@/apis/server/graphql/Graphql.server';
import { MODULE_STATUS_MOCK } from '@/apis/server/graphql/mocks/ModuleStatus.mock';
import { API_ERROR_CODES, API_ERROR_SOURCES, WebApiError } from '@/apis/WebApi.errors';

import { MODULE_STATUS_QUERY } from './ModuleStatus.graphql';
import { loadModuleStatusText } from './ModuleStatus.server';

vi.mock('../../apis/server/graphql/Graphql.server', () => ({
  executeGraphql: vi.fn<typeof executeGraphql>(),
  requireRootField: () => (data: unknown) => data,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('loadModuleStatusText', () => {
  it('asks its query with its mock key', async () => {
    vi.mocked(executeGraphql).mockResolvedValue(MODULE_STATUS_MOCK);
    await loadModuleStatusText();
    expect(executeGraphql).toHaveBeenCalledWith(
      MODULE_STATUS_QUERY,
      expect.objectContaining({ mock: 'module-status' }),
    );
  });

  it('returns the text', async () => {
    vi.mocked(executeGraphql).mockResolvedValue(MODULE_STATUS_MOCK);
    await expect(loadModuleStatusText()).resolves.toEqual(MODULE_STATUS_MOCK.statusText);
  });

  it('returns null when the read failed', async () => {
    vi.mocked(executeGraphql).mockRejectedValue(
      new WebApiError({
        source: API_ERROR_SOURCES.CMS_API_GRAPHQL,
        errorCode: API_ERROR_CODES.GRAPHQL.NO_DATA,
      }),
    );
    await expect(loadModuleStatusText()).resolves.toBeNull();
  });

  it('does not hide an unexpected error', async () => {
    vi.mocked(executeGraphql).mockRejectedValue(new TypeError('bug'));
    await expect(loadModuleStatusText()).rejects.toThrow(TypeError);
  });
});
