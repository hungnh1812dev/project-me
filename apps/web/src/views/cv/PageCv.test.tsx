import { render, screen } from '@testing-library/react';

import { executeGraphql } from '@/apis/server/graphql/Graphql.server';
import { PAGE_CV_MOCK } from '@/apis/server/graphql/mocks/PageCv.mock';
import { fakeApi, Wrapper } from '@/features/session/Session.fixture';

import PageCv, { generateMetadata } from './PageCv';
import { CV_COMMON_TEXT_QUERY, PAGE_CV_A_QUERY, PROFILE_QUERY } from './PageCv.graphql';

vi.mock('@/apis/server/graphql/Graphql.server', () => ({
  executeGraphql: vi.fn<typeof executeGraphql>(),
  requireRootField: () => (data: unknown) => data,
}));
const executeGraphqlMock = vi.mocked(executeGraphql);

interface CvAnswers {
  pageCvAList: unknown;
  profile: unknown;
  cvCommonText?: unknown;
}

/** Each of the three queries answers its own root field. */
function answerWith({ pageCvAList, profile, cvCommonText = PAGE_CV_MOCK.cvCommonText }: CvAnswers) {
  executeGraphqlMock.mockImplementation((query: string) => {
    if (query === PAGE_CV_A_QUERY) return Promise.resolve({ pageCvAList });
    if (query === PROFILE_QUERY) return Promise.resolve({ profile });
    if (query === CV_COMMON_TEXT_QUERY) return Promise.resolve({ cvCommonText });
    return Promise.reject(new Error('unexpected query'));
  });
}

const EMPTY = { pageCvAList: { data: [] }, profile: null };
const WITH_CV = {
  pageCvAList: {
    data: [
      {
        documentId: 'c1',
        name: 'Mai Server',
        position: 'Engineer',
        educations: null,
        _maskedFields: [],
      },
    ],
  },
  profile: null,
} as CvAnswers;

describe('PageCv', () => {
  beforeEach(() => {
    executeGraphqlMock.mockReset();
  });

  it('renders the name and position of the main CV', async () => {
    answerWith(WITH_CV);
    const page = await PageCv();
    render(<Wrapper api={fakeApi()}>{page}</Wrapper>);
    expect(screen.getByRole('heading', { level: 1, name: 'Mai Server' })).toBeInTheDocument();
    expect(screen.getByText('Engineer')).toBeInTheDocument();
  });

  it('answers 404 when no main CV is published', async () => {
    answerWith(EMPTY);
    const error = await PageCv().catch((caught: unknown) => caught);
    expect((error as { digest: string }).digest).toContain('404');
  });

  it('lets a null cvCommonText reach the error boundary', async () => {
    executeGraphqlMock.mockImplementation((query: string) =>
      query === CV_COMMON_TEXT_QUERY
        ? Promise.reject(Object.assign(new Error('NO_DATA'), { errorCode: 'NO_DATA' }))
        : Promise.resolve({ ...WITH_CV }),
    );
    await expect(PageCv()).rejects.toMatchObject({ errorCode: 'NO_DATA' });
  });

  it('lets a failed read reach the error boundary', async () => {
    executeGraphqlMock.mockImplementation(() => Promise.reject(new Error('down')));
    await expect(PageCv()).rejects.toThrow('down');
  });
});

describe('generateMetadata', () => {
  beforeEach(() => {
    executeGraphqlMock.mockReset();
  });

  it('titles the page with name and position', async () => {
    answerWith(WITH_CV);
    await expect(generateMetadata()).resolves.toEqual({ title: 'Mai Server - Engineer' });
  });

  it('keeps the default title when there is no CV or the load fails', async () => {
    answerWith(EMPTY);
    await expect(generateMetadata()).resolves.toEqual({});
    executeGraphqlMock.mockImplementation(() => Promise.reject(new Error('down')));
    await expect(generateMetadata()).resolves.toEqual({});
  });
});
