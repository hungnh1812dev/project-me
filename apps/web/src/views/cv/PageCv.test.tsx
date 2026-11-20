import { notFound } from 'next/navigation';
import { render, screen } from '@testing-library/react';

import { executeGraphql } from '@/apis/server/graphql/Graphql.server';
import { PAGE_CV_MOCK } from '@/apis/server/graphql/mocks/PageCv.mock';
import { fakeApi, Wrapper } from '@/features/session/Session.fixture';

import PageCv, { CV_ROBOTS_METADATA, generateMetadata } from './PageCv';
import { CV_COMMON_TEXT_QUERY, PAGE_CV_A_QUERY, PROFILE_QUERY } from './PageCv.graphql';

vi.mock('next/navigation', () => ({
  notFound: vi.fn<() => never>(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('@/apis/server/graphql/Graphql.server', () => ({
  executeGraphql: vi.fn<typeof executeGraphql>(),
  requireRootField: () => (data: unknown) => data,
}));
const executeGraphqlMock = vi.mocked(executeGraphql);

interface CvAnswers {
  pageCvA: unknown;
  profile: unknown;
  cvCommonText?: unknown;
}

/** Each of the three queries answers its own root field. */
function answerWith({ pageCvA, profile, cvCommonText = PAGE_CV_MOCK.cvCommonText }: CvAnswers) {
  executeGraphqlMock.mockImplementation((query: string) => {
    if (query === PAGE_CV_A_QUERY) return Promise.resolve({ pageCvA });
    if (query === PROFILE_QUERY) return Promise.resolve({ profile });
    if (query === CV_COMMON_TEXT_QUERY) return Promise.resolve({ cvCommonText });
    return Promise.reject(new Error('unexpected query'));
  });
}

const DOCUMENT_ID = '3f6c1a52-9d4e-4b7a-8c21-5e0a7d9b1f34';
const ROUTE = { params: Promise.resolve({ documentId: DOCUMENT_ID }) };
const NO_CV = { pageCvA: null, profile: null } as CvAnswers;
const WITH_CV = {
  pageCvA: {
    documentId: DOCUMENT_ID,
    name: 'Mai Server',
    position: 'Engineer',
    educations: null,
    _maskedFields: [],
  },
  profile: null,
} as CvAnswers;

describe('PageCv', () => {
  beforeEach(() => {
    executeGraphqlMock.mockReset();
  });

  it('renders the name and position of the CV', async () => {
    answerWith(WITH_CV);
    const page = await PageCv(ROUTE);
    render(<Wrapper api={fakeApi()}>{page}</Wrapper>);
    expect(screen.getByRole('heading', { level: 1, name: 'Mai Server' })).toBeInTheDocument();
    expect(screen.getByText('Engineer')).toBeInTheDocument();
  });

  it('shows the sanitized noCvText when the pageCvA read failed', async () => {
    executeGraphqlMock.mockImplementation((query: string) =>
      query === CV_COMMON_TEXT_QUERY
        ? Promise.resolve({
            cvCommonText: { ...PAGE_CV_MOCK.cvCommonText, noCvText: '<p>Back soon</p>' },
          })
        : Promise.reject(new Error('down')),
    );
    render(await PageCv(ROUTE));
    expect(screen.getByText('Back soon')).toBeInTheDocument();
  });

  it('shows the last-resort text when the read fails and there is no text', async () => {
    executeGraphqlMock.mockImplementation(() => Promise.reject(new Error('down')));
    render(await PageCv(ROUTE));
    expect(screen.getByText('No CV is live yet.')).toBeInTheDocument();
  });

  it('still renders the CV when only the text fails', async () => {
    executeGraphqlMock.mockImplementation((query: string) =>
      query === CV_COMMON_TEXT_QUERY
        ? Promise.reject(new Error('down'))
        : Promise.resolve(
            query === PAGE_CV_A_QUERY ? { pageCvA: WITH_CV.pageCvA } : { profile: null },
          ),
    );
    render(<Wrapper api={fakeApi()}>{await PageCv(ROUTE)}</Wrapper>);
    expect(screen.getByRole('heading', { level: 1, name: 'Mai Server' })).toBeInTheDocument();
  });
});

describe('PageCv not-found', () => {
  beforeEach(() => {
    executeGraphqlMock.mockReset();
  });

  it('calls notFound() when no published CV has the id', async () => {
    answerWith(NO_CV);
    await expect(PageCv(ROUTE)).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalled();
  });

  it('calls notFound() for a malformed id without a cms-api call', async () => {
    await expect(PageCv({ params: Promise.resolve({ documentId: 'x' }) })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    );
    expect(executeGraphqlMock).not.toHaveBeenCalled();
  });
});

describe('generateMetadata', () => {
  beforeEach(() => {
    executeGraphqlMock.mockReset();
  });

  it('titles the page with name and position, and asks crawlers to keep out', async () => {
    answerWith(WITH_CV);
    await expect(generateMetadata(ROUTE)).resolves.toEqual({
      ...CV_ROBOTS_METADATA,
      title: 'Mai Server - Engineer',
    });
  });

  it('keeps the default title when the CV has no name', async () => {
    answerWith({ ...WITH_CV, pageCvA: { documentId: DOCUMENT_ID, _maskedFields: [] } });
    await expect(generateMetadata(ROUTE)).resolves.toEqual(CV_ROBOTS_METADATA);
  });

  it('carries the robots tags on every state', async () => {
    expect(CV_ROBOTS_METADATA).toEqual({
      robots: { index: false, follow: false, noarchive: true, nosnippet: true },
    });
    answerWith(NO_CV);
    await expect(generateMetadata(ROUTE)).resolves.toEqual(CV_ROBOTS_METADATA);
    executeGraphqlMock.mockImplementation(() => Promise.reject(new Error('down')));
    await expect(generateMetadata(ROUTE)).resolves.toEqual(CV_ROBOTS_METADATA);
    await expect(
      generateMetadata({ params: Promise.resolve({ documentId: 'x' }) }),
    ).resolves.toEqual(CV_ROBOTS_METADATA);
  });
});
