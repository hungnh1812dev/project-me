import { executeGraphql } from '@/apis/server/graphql/Graphql.server';
import { PAGE_CV_MOCK } from '@/apis/server/graphql/mocks/PageCv.mock';
import { API_ERROR_CODES, API_ERROR_SOURCES, WebApiError } from '@/apis/WebApi.errors';
import { readWebSession } from '@/features/session/WebSession.server';

import { answerCvRead, loadPageCv } from './PageCv.data';
import { CV_COMMON_TEXT_QUERY, PAGE_CV_A_QUERY, PROFILE_QUERY } from './PageCv.graphql';

vi.mock('@/apis/server/graphql/Graphql.server', () => ({
  executeGraphql: vi.fn<typeof executeGraphql>(),
  requireRootField: () => (data: unknown) => data,
}));

vi.mock('@/features/session/WebSession.server', () => ({
  readWebSession: vi.fn<typeof readWebSession>(),
}));

const noData = () =>
  new WebApiError({
    source: API_ERROR_SOURCES.CMS_API_GRAPHQL,
    errorCode: API_ERROR_CODES.GRAPHQL.NO_DATA,
  });

type Answers = Partial<Record<'list' | 'profile' | 'text', unknown>>;

/** Each query answers its root field; a `WebApiError` value makes that query fail. */
function answerWith({ list, profile, text }: Answers = {}) {
  const answers = new Map<string, [string, unknown]>([
    [PAGE_CV_A_QUERY, ['pageCvAList', list ?? { data: [] }]],
    [PROFILE_QUERY, ['profile', profile ?? null]],
    [CV_COMMON_TEXT_QUERY, ['cvCommonText', text ?? PAGE_CV_MOCK.cvCommonText]],
  ]);
  vi.mocked(executeGraphql).mockImplementation((query: string) => {
    const [rootField, value] = answers.get(query) ?? ['', undefined];
    return value instanceof WebApiError
      ? Promise.reject(value)
      : Promise.resolve({ [rootField]: value });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('loadPageCv', () => {
  it('asks the three queries with their mock keys', async () => {
    answerWith();
    await loadPageCv();
    const mocks = vi.mocked(executeGraphql).mock.calls.map(([, options]) => options?.mock);
    expect(mocks.sort()).toEqual(['cv-common-text', 'page-cv-a', 'profile']);
  });

  it('sanitizes richtext on the server before it reaches the page', async () => {
    answerWith({
      list: {
        data: [
          {
            documentId: 'r1',
            summary: '<p>ok</p><script>steal()</script><img src=x onerror=x()>',
            experiences: [{ roles: [{ responsibilities: '<a href="javascript:x()">go</a>' }] }],
          },
        ],
      },
    });

    const [cv] = (await loadPageCv()).data.pageCvAList.data;

    expect(cv?.summary).toBe('<p>ok</p>');
    expect(cv?.experiences?.[0]?.roles?.[0]?.responsibilities).toBe('<a>go</a>');
  });

  it('hands over the CV labels next to the data', async () => {
    answerWith();
    expect((await loadPageCv()).text).toBe(PAGE_CV_MOCK.cvCommonText);
  });

  it('accepts a profile that could not be read', async () => {
    answerWith({ profile: noData() });
    await expect(loadPageCv()).resolves.toMatchObject({ data: { profile: null } });
  });

  it.each(['list', 'text'] as const)('throws when the %s could not be read', async (failed) => {
    answerWith({ [failed]: noData() });
    await expect(loadPageCv()).rejects.toMatchObject({
      errorCode: 'NO_DATA',
      source: 'cms-api-graphql',
    });
  });
});

describe('answerCvRead', () => {
  const context = {
    request: new Request('https://site.test/api/v1/cv'),
    body: {},
    visitorIp: undefined,
  };

  it('reads the CV with the visitor token, uncached, and passes a rotated cookie on', async () => {
    vi.mocked(readWebSession).mockResolvedValue({
      status: 'signed-in',
      account: {} as never,
      accessToken: 'tok-1',
      setCookies: ['web_session=new; Path=/'],
    });
    vi.mocked(executeGraphql).mockResolvedValue({ pageCvAList: { data: [] }, profile: null });

    const response = await answerCvRead(context);

    expect(vi.mocked(executeGraphql).mock.lastCall?.[1]).toEqual({ accessToken: 'tok-1' });
    expect(await response.json()).toEqual({ pageCvAList: { data: [] }, profile: null });
    expect(response.headers.getSetCookie()).toEqual(['web_session=new; Path=/']);
  });

  it('refuses with BFF_SESSION_REQUIRED, keeping the cleared cookie, when signed out', async () => {
    vi.mocked(readWebSession).mockResolvedValue({
      status: 'signed-out',
      setCookies: ['web_session=; Max-Age=0'],
    });

    await expect(answerCvRead(context)).rejects.toMatchObject({
      errorCode: 'BFF_SESSION_REQUIRED',
      setCookies: ['web_session=; Max-Age=0'],
    });
    expect(executeGraphql).not.toHaveBeenCalled();
  });
});
