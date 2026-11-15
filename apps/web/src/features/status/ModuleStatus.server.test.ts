import { runContentQuery } from '@/apis/server/graphql/Graphql.server';
import { MODULE_STATUS_MOCK } from '@/apis/server/graphql/mocks/ModuleStatus.mock';

import { loadModuleStatusText } from './ModuleStatus.server';

vi.mock('../../apis/server/graphql/Graphql.server', () => ({
  defineContentQuery: (definition: object) => ({ ...definition, document: {} }),
  runContentQuery: vi.fn<typeof runContentQuery>(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('loadModuleStatusText', () => {
  it('returns the page text', async () => {
    vi.mocked(runContentQuery).mockResolvedValue({
      data: MODULE_STATUS_MOCK,
      failedRootFields: [],
    });
    await expect(loadModuleStatusText()).resolves.toEqual(MODULE_STATUS_MOCK.statusText);
  });

  it('returns null when statusText failed', async () => {
    vi.mocked(runContentQuery).mockResolvedValue({
      data: { statusText: null },
      failedRootFields: ['statusText'] as never,
    });
    await expect(loadModuleStatusText()).resolves.toBeNull();
  });
});
