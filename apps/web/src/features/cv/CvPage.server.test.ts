import { runContentQuery, runVisitorQuery } from '@/apis/server/graphql/Graphql.server';
import { CV_PAGE_MOCK } from '@/apis/server/restful/mocks/CvPage.mock';

import { readWebSession } from '../session/WebSession.server';
import { answerCvRead, loadCvPage } from './CvPage.server';

vi.mock('../../apis/server/graphql/Graphql.server', () => ({
  defineContentQuery: (definition: object) => ({ ...definition, document: {} }),
  runContentQuery: vi.fn<typeof runContentQuery>(),
  runVisitorQuery: vi.fn<typeof runVisitorQuery>(),
}));

vi.mock('../session/WebSession.server', () => ({
  readWebSession: vi.fn<typeof readWebSession>(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('loadCvPage', () => {
  it('sanitizes richtext on the server before it reaches the page', async () => {
    vi.mocked(runContentQuery).mockResolvedValue({
      failedRootFields: [],
      data: {
        cvPageList: {
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
        cvContact: null,
        cvPageText: CV_PAGE_MOCK.cvPageText,
      },
    });

    const [resume] = (await loadCvPage()).data.cvPageList.data;

    expect(resume?.summary).toBe('<p>ok</p>');
    expect(resume?.experiences?.[0]?.roles?.[0]?.responsibilities).toBe('<a>go</a>');
  });

  it('hands over the page text next to the data', async () => {
    vi.mocked(runContentQuery).mockResolvedValue({
      failedRootFields: [],
      data: { cvPageList: { data: [] }, cvContact: null, cvPageText: CV_PAGE_MOCK.cvPageText },
    });
    expect((await loadCvPage()).text).toBe(CV_PAGE_MOCK.cvPageText);
  });

  it('accepts a missing contact card', async () => {
    vi.mocked(runContentQuery).mockResolvedValue({
      failedRootFields: ['cvContact'],
      data: { cvPageList: { data: [] }, cvContact: null, cvPageText: CV_PAGE_MOCK.cvPageText },
    } as never);
    await expect(loadCvPage()).resolves.toMatchObject({ data: { cvContact: null } });
  });

  it.each(['cvPageList', 'cvPageText'] as const)(
    'throws when %s could not be read',
    async (failed) => {
      vi.mocked(runContentQuery).mockResolvedValue({
        failedRootFields: [failed],
        data: {
          cvPageList: { data: [] },
          cvContact: null,
          cvPageText: CV_PAGE_MOCK.cvPageText,
          [failed]: null,
        },
      } as never);
      await expect(loadCvPage()).rejects.toMatchObject({ code: 'NO_DATA' });
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
    vi.mocked(runVisitorQuery).mockResolvedValue({ cvPageList: { data: [] }, cvContact: null });

    const response = await answerCvRead(context);

    expect(vi.mocked(runVisitorQuery).mock.lastCall?.[1]).toBe('tok-1');
    expect(await response.json()).toEqual({ cvPageList: { data: [] }, cvContact: null });
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
