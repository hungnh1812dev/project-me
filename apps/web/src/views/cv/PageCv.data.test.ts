import { executeGraphql } from '@/apis/server/graphql/Graphql.server';
import { PAGE_CV_MOCK } from '@/apis/server/graphql/mocks/PageCv.mock';
import { API_ERROR_CODES, API_ERROR_SOURCES, logApiError, WebApiError } from '@/apis/WebApi.errors';
import { readWebSession } from '@/features/session/WebSession.server';

import { answerCvRead, loadPageCv, parseCvDocumentId } from './PageCv.data';
import { CV_COMMON_TEXT_QUERY, PAGE_CV_A_QUERY, PROFILE_QUERY } from './PageCv.graphql';

// React's `cache` only memoizes inside a server request; this stand-in memoizes by first argument
// until `renderScope.clear()`, so a test can play one render.
const renderScope = vi.hoisted(() => new Map<unknown, unknown>());

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  cache:
    <Args extends unknown[], Result>(load: (...args: Args) => Result) =>
    (...args: Args): Result => {
      if (!renderScope.has(args[0])) renderScope.set(args[0], load(...args));
      return renderScope.get(args[0]) as Result;
    },
}));

vi.mock('@/apis/server/graphql/Graphql.server', () => ({
  executeGraphql: vi.fn<typeof executeGraphql>(),
  requireRootField: () => (data: unknown) => data,
}));

vi.mock('@/apis/WebApi.errors', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/apis/WebApi.errors')>()),
  logApiError: vi.fn<typeof logApiError>(),
}));

vi.mock('@/features/session/WebSession.server', () => ({
  readWebSession: vi.fn<typeof readWebSession>(),
}));

const DOCUMENT_ID = '3f6c1a52-9d4e-4b7a-8c21-5e0a7d9b1f34';
const CV = { documentId: DOCUMENT_ID, name: 'Mai', _maskedFields: [] };

const noData = () =>
  new WebApiError({
    source: API_ERROR_SOURCES.CMS_API_GRAPHQL,
    errorCode: API_ERROR_CODES.GRAPHQL.NO_DATA,
  });

type Answers = Partial<Record<'list' | 'profile' | 'text', unknown>>;

/** Each query answers its root field; a `WebApiError` value makes that query fail. */
function answerWith({ list, profile, text }: Answers = {}) {
  const answers = new Map<string, [string, unknown]>([
    [PAGE_CV_A_QUERY, ['pageCvA', list === undefined ? null : list]],
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
  renderScope.clear();
});

describe('loadPageCv', () => {
  it('asks the three queries with their mock keys', async () => {
    answerWith();
    await loadPageCv(DOCUMENT_ID);
    const mocks = vi.mocked(executeGraphql).mock.calls.map(([, options]) => options?.mock);
    expect(mocks.sort()).toEqual(['cv-common-text', 'page-cv-a', 'profile']);
  });

  it('sanitizes richtext on the server before it reaches the page', async () => {
    answerWith({
      list: {
        documentId: DOCUMENT_ID,
        summary: '<p>ok</p><script>steal()</script><img src=x onerror=x()>',
        experiences: [{ roles: [{ responsibilities: '<a href="javascript:x()">go</a>' }] }],
      },
    });

    const content = await loadPageCv(DOCUMENT_ID);
    if (content.state !== 'cv') throw new Error('expected a CV');
    const cv = content.data.pageCvA;

    expect(cv.summary).toBe('<p>ok</p>');
    expect(cv.experiences?.[0]?.roles?.[0]?.responsibilities).toBe('<a>go</a>');
  });

  it('hands over the CV labels next to the data, with noCvText sanitized', async () => {
    answerWith({
      list: CV,
      text: { ...PAGE_CV_MOCK.cvCommonText, noCvText: '<p>none</p><script>x()</script>' },
    });
    expect(await loadPageCv(DOCUMENT_ID)).toMatchObject({
      state: 'cv',
      text: { summary: PAGE_CV_MOCK.cvCommonText.summary, noCvText: '<p>none</p>' },
    });
  });

  it('accepts a profile that could not be read', async () => {
    answerWith({ list: CV, profile: noData() });
    await expect(loadPageCv(DOCUMENT_ID)).resolves.toMatchObject({
      state: 'cv',
      data: { profile: null },
    });
  });

  it('keeps the CV with no labels when the text could not be read', async () => {
    answerWith({ list: CV, text: noData() });
    await expect(loadPageCv(DOCUMENT_ID)).resolves.toMatchObject({ state: 'cv', text: null });
  });

  it('is not-found, never mocked, when pageCvA answers null', async () => {
    answerWith();
    await expect(loadPageCv(DOCUMENT_ID)).resolves.toEqual({ state: 'not-found' });
    expect(logApiError).not.toHaveBeenCalled();
  });

  it('is not-found with no cms-api call when the id is not a UUID', async () => {
    answerWith();
    await expect(loadPageCv('not-a-uuid')).resolves.toEqual({ state: 'not-found' });
    expect(executeGraphql).not.toHaveBeenCalled();
  });

  it('passes the id only as a GraphQL variable', async () => {
    answerWith();
    await loadPageCv(DOCUMENT_ID);
    const [query, options] = vi
      .mocked(executeGraphql)
      .mock.calls.find(([text]) => text === PAGE_CV_A_QUERY)!;
    expect(options?.variables).toEqual({ documentId: DOCUMENT_ID });
    expect(query).not.toContain(DOCUMENT_ID);
  });

  it('is the no-CV-live state, with no second log line, when the pageCvA read failed', async () => {
    answerWith({ list: noData(), text: noData() });
    await expect(loadPageCv(DOCUMENT_ID)).resolves.toEqual({ state: 'no-cv-live', text: null });
    expect(logApiError).not.toHaveBeenCalled();
  });

  it('reads the CV once when generateMetadata and the page both ask in one render', async () => {
    answerWith();
    await Promise.all([loadPageCv(DOCUMENT_ID), loadPageCv(DOCUMENT_ID)]);
    expect(executeGraphql).toHaveBeenCalledTimes(3);
    const pageCvReads = vi.mocked(executeGraphql).mock.calls.filter(([q]) => q === PAGE_CV_A_QUERY);
    expect(pageCvReads).toHaveLength(1);
  });

  it('starts the three queries together', async () => {
    answerWith();
    await loadPageCv(DOCUMENT_ID);
    expect(executeGraphql).toHaveBeenCalledTimes(3);
  });
});

describe('parseCvDocumentId', () => {
  it('returns a UUID as is and anything else as null', () => {
    expect(parseCvDocumentId(DOCUMENT_ID)).toBe(DOCUMENT_ID);
    expect(parseCvDocumentId('mock-page-cv')).toBeNull();
    expect(parseCvDocumentId(`${DOCUMENT_ID} `)).toBeNull();
    expect(parseCvDocumentId(undefined)).toBeNull();
  });
});

describe('answerCvRead', () => {
  const context = {
    request: new Request('https://site.test/api/v1/cv'),
    body: {},
    visitorIp: undefined,
    params: { documentId: DOCUMENT_ID },
  };

  it('reads the CV with the visitor token, uncached, and passes a rotated cookie on', async () => {
    vi.mocked(readWebSession).mockResolvedValue({
      status: 'signed-in',
      account: {} as never,
      accessToken: 'tok-1',
      setCookies: ['web_session=new; Path=/'],
    });
    vi.mocked(executeGraphql).mockResolvedValue({ pageCvA: CV, profile: null });

    const response = await answerCvRead(context);

    expect(vi.mocked(executeGraphql).mock.lastCall?.[1]).toMatchObject({
      accessToken: 'tok-1',
      variables: { documentId: DOCUMENT_ID },
    });
    expect(await response.json()).toMatchObject({ pageCvA: CV, profile: null });
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

  it('answers 401 before parsing the id, for a malformed id too', async () => {
    vi.mocked(readWebSession).mockResolvedValue({ status: 'signed-out', setCookies: [] });

    await expect(
      answerCvRead({ ...context, params: { documentId: 'not-a-uuid' } }),
    ).rejects.toMatchObject({ errorCode: 'BFF_SESSION_REQUIRED' });
  });

  it('answers BFF_NOT_FOUND for a malformed id without asking cms-api', async () => {
    vi.mocked(executeGraphql).mockClear();
    vi.mocked(readWebSession).mockResolvedValue({
      status: 'signed-in',
      account: {} as never,
      accessToken: 'tok-1',
      setCookies: [],
    });

    await expect(
      answerCvRead({ ...context, params: { documentId: '../graphql' } }),
    ).rejects.toMatchObject({ errorCode: 'BFF_NOT_FOUND' });
    expect(executeGraphql).not.toHaveBeenCalled();
  });

  it('answers the same BFF_NOT_FOUND when no published CV has the id', async () => {
    vi.mocked(readWebSession).mockResolvedValue({
      status: 'signed-in',
      account: {} as never,
      accessToken: 'tok-1',
      setCookies: ['web_session=new; Path=/'],
    });
    vi.mocked(executeGraphql).mockResolvedValue({ pageCvA: null, profile: null });

    await expect(answerCvRead(context)).rejects.toMatchObject({
      errorCode: 'BFF_NOT_FOUND',
      statusCode: 404,
    });
  });
});
