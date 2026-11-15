import { runContentQuery, runVisitorQuery } from '@/apis/server/graphql/Graphql.server';
import { PAGE_CV_MOCK } from '@/apis/server/graphql/mocks/PageCv.mock';
import { readWebSession } from '@/features/session/WebSession.server';

import { answerCvRead, loadPageCv } from './PageCv.data';

vi.mock('@/apis/server/graphql/Graphql.server', () => ({
  defineContentQuery: (definition: object) => ({ ...definition, document: {} }),
  runContentQuery: vi.fn<typeof runContentQuery>(),
  runVisitorQuery: vi.fn<typeof runVisitorQuery>(),
}));

vi.mock('@/features/session/WebSession.server', () => ({
  readWebSession: vi.fn<typeof readWebSession>(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('loadPageCv', () => {
  it('sanitizes richtext on the server before it reaches the page', async () => {
    vi.mocked(runContentQuery).mockResolvedValue({
      failedRootFields: [],
      data: {
        pageCvAList: {
          data: [
            {
              documentId: 'r1',
              summary: '<p>ok</p><script>steal()</script><img src=x onerror=x()>',
              experiences: [
                {
                  roles: [{ responsibilities: '<a href="javascript:x()">go</a>' }],
                },
              ],
            },
          ],
        },
        profile: null,
        pageCvText: PAGE_CV_MOCK.pageCvText,
      },
    });

    const [cv] = (await loadPageCv()).data.pageCvAList.data;

    expect(cv?.summary).toBe('<p>ok</p>');
    expect(cv?.experiences?.[0]?.roles?.[0]?.responsibilities).toBe('<a>go</a>');
  });

  it('hands over the page text next to the data', async () => {
    vi.mocked(runContentQuery).mockResolvedValue({
      failedRootFields: [],
      data: { pageCvAList: { data: [] }, profile: null, pageCvText: PAGE_CV_MOCK.pageCvText },
    });
    expect((await loadPageCv()).text).toBe(PAGE_CV_MOCK.pageCvText);
  });

  it('accepts a missing profile', async () => {
    vi.mocked(runContentQuery).mockResolvedValue({
      failedRootFields: ['profile'],
      data: { pageCvAList: { data: [] }, profile: null, pageCvText: PAGE_CV_MOCK.pageCvText },
    } as never);
    await expect(loadPageCv()).resolves.toMatchObject({ data: { profile: null } });
  });

  it.each(['pageCvAList', 'pageCvText'] as const)(
    'throws when %s could not be read',
    async (failed) => {
      vi.mocked(runContentQuery).mockResolvedValue({
        failedRootFields: [failed],
        data: {
          pageCvAList: { data: [] },
          profile: null,
          pageCvText: PAGE_CV_MOCK.pageCvText,
          [failed]: null,
        },
      } as never);
      await expect(loadPageCv()).rejects.toMatchObject({
        errorCode: 'NO_DATA',
        source: 'cms-api-graphql',
      });
    },
  );
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
    vi.mocked(runVisitorQuery).mockResolvedValue({ pageCvAList: { data: [] }, profile: null });

    const response = await answerCvRead(context);

    expect(vi.mocked(runVisitorQuery).mock.lastCall?.[1]).toBe('tok-1');
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
    expect(runVisitorQuery).not.toHaveBeenCalled();
  });
});
