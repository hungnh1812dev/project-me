import { render, screen } from '@testing-library/react';

import { runContentQuery } from '@/apis/server/graphql/Graphql.server';
import { PAGE_CV_MOCK } from '@/apis/server/graphql/mocks/PageCv.mock';
import { fakeApi, Wrapper } from '@/features/session/Session.fixture';

import PageCv, { generateMetadata } from './PageCv';
import type { PageCvResult } from './PageCv.graphql';

vi.mock('@/apis/server/graphql/Graphql.server', () => ({
  defineContentQuery: (definition: object) => ({ ...definition, document: {} }),
  runContentQuery: vi.fn<typeof runContentQuery>(),
}));
const runContentQueryMock = vi.mocked(runContentQuery);
const resultOf = (data: Pick<PageCvResult, 'pageCvAList' | 'profile'>) =>
  ({ failedRootFields: [], data: { ...data, pageCvText: PAGE_CV_MOCK.pageCvText } }) as never;

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
} as unknown as Parameters<typeof resultOf>[0];

describe('PageCv', () => {
  beforeEach(() => {
    runContentQueryMock.mockReset();
  });

  it('renders the name and position of the main CV', async () => {
    runContentQueryMock.mockResolvedValue(resultOf(WITH_CV));
    const page = await PageCv();
    render(<Wrapper api={fakeApi()}>{page}</Wrapper>);
    expect(screen.getByRole('heading', { level: 1, name: 'Mai Server' })).toBeInTheDocument();
    expect(screen.getByText('Engineer')).toBeInTheDocument();
  });

  it('answers 404 when no main CV is published', async () => {
    runContentQueryMock.mockResolvedValue(resultOf(EMPTY));
    const error = await PageCv().catch((caught: unknown) => caught);
    expect((error as { digest: string }).digest).toContain('404');
  });

  it('lets a null page text reach the error boundary', async () => {
    runContentQueryMock.mockResolvedValue({
      failedRootFields: ['pageCvText'],
      data: { ...WITH_CV, pageCvText: null },
    } as never);
    await expect(PageCv()).rejects.toMatchObject({ errorCode: 'NO_DATA' });
  });

  it('lets a failed read reach the error boundary', async () => {
    runContentQueryMock.mockImplementation(() => Promise.reject(new Error('down')));
    await expect(PageCv()).rejects.toThrow('down');
  });
});

describe('generateMetadata', () => {
  beforeEach(() => {
    runContentQueryMock.mockReset();
  });

  it('titles the page with name and position', async () => {
    runContentQueryMock.mockResolvedValue(resultOf(WITH_CV));
    await expect(generateMetadata()).resolves.toEqual({ title: 'Mai Server - Engineer' });
  });

  it('keeps the default title when there is no CV or the load fails', async () => {
    runContentQueryMock.mockResolvedValueOnce(resultOf(EMPTY));
    await expect(generateMetadata()).resolves.toEqual({});
    runContentQueryMock.mockImplementationOnce(() => Promise.reject(new Error('down')));
    await expect(generateMetadata()).resolves.toEqual({});
  });
});
