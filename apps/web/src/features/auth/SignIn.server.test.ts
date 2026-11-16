import { executeGraphql } from '@/apis/server/graphql/Graphql.server';
import { SIGN_IN_MOCK } from '@/apis/server/graphql/mocks/SignIn.mock';
import { API_ERROR_CODES, API_ERROR_SOURCES, WebApiError } from '@/apis/WebApi.errors';

import { SIGN_IN_QUERY } from './SignIn.graphql';
import { loadSignInText } from './SignIn.server';

vi.mock('../../apis/server/graphql/Graphql.server', () => ({
  executeGraphql: vi.fn<typeof executeGraphql>(),
  requireRootField: () => (data: unknown) => data,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('loadSignInText', () => {
  it('asks its query with its mock key', async () => {
    vi.mocked(executeGraphql).mockResolvedValue(SIGN_IN_MOCK);
    await loadSignInText();
    expect(executeGraphql).toHaveBeenCalledWith(
      SIGN_IN_QUERY,
      expect.objectContaining({ mock: 'sign-in' }),
    );
  });

  it('returns the text', async () => {
    vi.mocked(executeGraphql).mockResolvedValue(SIGN_IN_MOCK);
    await expect(loadSignInText()).resolves.toEqual(SIGN_IN_MOCK.signInText);
  });

  it('returns null when the read failed', async () => {
    vi.mocked(executeGraphql).mockRejectedValue(
      new WebApiError({
        source: API_ERROR_SOURCES.CMS_API_GRAPHQL,
        errorCode: API_ERROR_CODES.GRAPHQL.NO_DATA,
      }),
    );
    await expect(loadSignInText()).resolves.toBeNull();
  });

  it('does not hide an unexpected error', async () => {
    vi.mocked(executeGraphql).mockRejectedValue(new TypeError('bug'));
    await expect(loadSignInText()).rejects.toThrow(TypeError);
  });
});
