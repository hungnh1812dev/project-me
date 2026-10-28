import { render, screen } from '@testing-library/react';

import { COPY } from '../config/Copy.constants';
import { fakeApi, Wrapper } from '../features/session/Session.fixture';
import type { CvPageData } from '../features/cv/Cv.graphql';
import { fetchGraphql } from '../lib/Graphql.server';
import HomePage, { generateMetadata } from './page';

vi.mock('../lib/Graphql.server', () => ({
  fetchGraphql: vi.fn<typeof fetchGraphql>(),
}));
const fetchGraphqlMock = vi.mocked(fetchGraphql);

const EMPTY: CvPageData = { resumeList: { data: [] }, cvContact: null };
const WITH_RESUME = {
  resumeList: {
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
} as unknown as CvPageData;

async function renderPage() {
  const page = await HomePage();
  return render(<Wrapper api={fakeApi()}>{page}</Wrapper>);
}

describe('HomePage', () => {
  beforeEach(() => {
    fetchGraphqlMock.mockReset();
  });

  it('renders the name and position of the main resume', async () => {
    fetchGraphqlMock.mockResolvedValue(WITH_RESUME);
    await renderPage();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Mai Server' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Engineer')).toBeInTheDocument();
  });

  it('renders the empty state when the list is empty', async () => {
    fetchGraphqlMock.mockResolvedValue(EMPTY);
    await renderPage();
    expect(
      screen.getByRole('heading', { level: 1, name: COPY.cv.emptyTitle }),
    ).toBeInTheDocument();
  });

  it('lets a failed load reach the error boundary', async () => {
    fetchGraphqlMock.mockImplementation(() =>
      Promise.reject(new Error('down')),
    );
    let caught: unknown;
    try {
      await HomePage();
    } catch (error) {
      caught = error;
    }
    expect((caught as Error).message).toBe('down');
  });
});

describe('generateMetadata', () => {
  beforeEach(() => {
    fetchGraphqlMock.mockReset();
  });

  it('titles the page with name and position', async () => {
    fetchGraphqlMock.mockResolvedValue(WITH_RESUME);
    await expect(generateMetadata()).resolves.toEqual({
      title: 'Mai Server - Engineer',
    });
  });

  it('keeps the default title when there is no resume or the load fails', async () => {
    fetchGraphqlMock.mockResolvedValueOnce(EMPTY);
    await expect(generateMetadata()).resolves.toEqual({});
    fetchGraphqlMock.mockImplementationOnce(() =>
      Promise.reject(new Error('down')),
    );
    await expect(generateMetadata()).resolves.toEqual({});
  });
});
