import { runContentQuery } from '@/apis/server/graphql/Graphql.server';
import { SIGN_IN_MOCK } from '@/apis/server/graphql/mocks/SignIn.mock';

import { loadSignInText } from './SignIn.server';

vi.mock('../../apis/server/graphql/Graphql.server', () => ({
  defineContentQuery: (definition: object) => ({ ...definition, document: {} }),
  runContentQuery: vi.fn<typeof runContentQuery>(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('loadSignInText', () => {
  it('returns the text', async () => {
    vi.mocked(runContentQuery).mockResolvedValue({ data: SIGN_IN_MOCK, failedRootFields: [] });
    await expect(loadSignInText()).resolves.toEqual(SIGN_IN_MOCK.signInText);
  });

  it('returns null when the root field failed', async () => {
    vi.mocked(runContentQuery).mockResolvedValue({
      data: { signInText: null },
      failedRootFields: ['signInText'] as never,
    });
    await expect(loadSignInText()).resolves.toBeNull();
  });

  it('returns null when the API answered the root field with null', async () => {
    vi.mocked(runContentQuery).mockResolvedValue({
      data: { signInText: null },
      failedRootFields: [],
    });
    await expect(loadSignInText()).resolves.toBeNull();
  });
});
