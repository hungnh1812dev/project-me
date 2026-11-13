import { render, screen } from '@testing-library/react';

import { runContentQuery } from '../../apis/server/graphql/Graphql.server';
import { CV_PAGE_MOCK } from '../../apis/server/graphql/mocks/CvPage.mock';
import type { CvPage as CvPageResult } from '../../features/cv/Cv.graphql';
import { fakeApi, Wrapper } from '../../features/session/Session.fixture';
import CvPage, { generateMetadata } from './page';

vi.mock('../../apis/server/graphql/Graphql.server', () => ({
  defineContentQuery: (definition: object) => ({ ...definition, document: {} }),
  runContentQuery: vi.fn<typeof runContentQuery>(),
}));
const runContentQueryMock = vi.mocked(runContentQuery);
const resultOf = (data: Pick<CvPageResult, 'cvPageList' | 'cvContact'>) =>
  ({ failedRootFields: [], data: { ...data, cvPageText: CV_PAGE_MOCK.cvPageText } }) as never;

const EMPTY = { cvPageList: { data: [] }, cvContact: null };
const WITH_RESUME = {
  cvPageList: {
    data: [
      {
        documentId: 'r1',
        name: 'Mai Server',
        position: 'Engineer',
        _maskedFields: [],
      },
    ],
  },
  cvContact: null,
} as unknown as Parameters<typeof resultOf>[0];

async function renderPage() {
  const page = await CvPage();
  return render(<Wrapper api={fakeApi()}>{page}</Wrapper>);
}

describe('CvPage', () => {
  beforeEach(() => {
    runContentQueryMock.mockReset();
  });

  it('renders the name and position of the main resume', async () => {
    runContentQueryMock.mockResolvedValue(resultOf(WITH_RESUME));
    await renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Mai Server' })).toBeInTheDocument();
    expect(screen.getByText('Engineer')).toBeInTheDocument();
  });

  it('renders the empty state when the list is empty', async () => {
    runContentQueryMock.mockResolvedValue(resultOf(EMPTY));
    await renderPage();
    expect(
      screen.getByRole('heading', { level: 1, name: CV_PAGE_MOCK.cvPageText.emptyTitle }),
    ).toBeInTheDocument();
  });

  it('lets a failed load reach the error boundary', async () => {
    runContentQueryMock.mockImplementation(() => Promise.reject(new Error('down')));
    let caught: unknown;
    try {
      await CvPage();
    } catch (error) {
      caught = error;
    }
    expect((caught as Error).message).toBe('down');
  });
});

describe('generateMetadata', () => {
  beforeEach(() => {
    runContentQueryMock.mockReset();
  });

  it('titles the page with name and position', async () => {
    runContentQueryMock.mockResolvedValue(resultOf(WITH_RESUME));
    await expect(generateMetadata()).resolves.toEqual({
      title: 'Mai Server - Engineer',
    });
  });

  it('keeps the default title when there is no resume or the load fails', async () => {
    runContentQueryMock.mockResolvedValueOnce(resultOf(EMPTY));
    await expect(generateMetadata()).resolves.toEqual({});
    runContentQueryMock.mockImplementationOnce(() => Promise.reject(new Error('down')));
    await expect(generateMetadata()).resolves.toEqual({});
  });
});
