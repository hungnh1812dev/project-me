import { fetchGraphql } from '../../apis/server/graphql/Graphql.server';
import { readWebSession } from '../session/WebSession.server';
import { answerCvRead, loadCvPage } from './CvPage.server';

vi.mock('../../apis/server/graphql/Graphql.server', () => ({
  fetchGraphql: vi.fn<typeof fetchGraphql>(),
}));

vi.mock('../session/WebSession.server', () => ({
  readWebSession: vi.fn<typeof readWebSession>(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('loadCvPage', () => {
  it('sanitizes richtext on the server before it reaches the page', async () => {
    vi.mocked(fetchGraphql).mockResolvedValue({
      resumeList: {
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
    });

    const [resume] = (await loadCvPage()).resumeList.data;

    expect(resume?.summary).toBe('<p>ok</p>');
    expect(resume?.experiences?.[0]?.roles?.[0]?.responsibilities).toBe('<a>go</a>');
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
    vi.mocked(fetchGraphql).mockResolvedValue({ resumeList: { data: [] }, cvContact: null });

    const response = await answerCvRead(context);

    expect(vi.mocked(fetchGraphql).mock.lastCall?.[2]).toEqual({ accessToken: 'tok-1' });
    expect(await response.json()).toEqual({ resumeList: { data: [] }, cvContact: null });
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
    expect(fetchGraphql).not.toHaveBeenCalled();
  });
});
