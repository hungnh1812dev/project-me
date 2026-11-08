import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { STATUS_PAGE_MOCK } from '@/apis/server/restful/mocks/StatusPage.mock';
import { LAST_RESORT_TEXT } from '@/features/site-shell';
import type { StatusPageText } from '@/features/status/StatusPage.graphql';

import { fetchLiveHealth } from '../../features/status/Health.api';
import { StatusView } from './StatusView';

vi.mock('../../features/status/Health.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../features/status/Health.api')>()),
  fetchLiveHealth: vi.fn<typeof fetchLiveHealth>(),
}));
const fetchLiveHealthMock = vi.mocked(fetchLiveHealth);
const TEXT = STATUS_PAGE_MOCK.statusPageText;

function renderView(text: StatusPageText | null = TEXT) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <StatusView text={text} />
    </QueryClientProvider>,
  );
}

describe('StatusView', () => {
  beforeEach(() => fetchLiveHealthMock.mockReset());

  it('shows the heading, the description and the BFF health path only', async () => {
    fetchLiveHealthMock.mockResolvedValue({ status: 'ok' });
    renderView();

    expect(screen.getByRole('heading', { level: 1, name: TEXT.title })).toBeInTheDocument();
    expect(screen.getByText(TEXT.description)).toBeInTheDocument();
    expect(await screen.findByText(TEXT.stateOk)).toBeInTheDocument();
    expect(screen.getByText('GET /api/v1/health')).toBeInTheDocument();
  });

  it('shows the unreachable state and re-checks on demand', async () => {
    fetchLiveHealthMock.mockRejectedValueOnce(new Error('offline'));
    renderView();
    expect(await screen.findByText(TEXT.stateError)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(TEXT.errorHint);

    fetchLiveHealthMock.mockResolvedValue({ status: 'ok' });
    await userEvent.click(screen.getByRole('button', { name: TEXT.checkAgain }));
    expect(await screen.findByText(TEXT.stateOk)).toBeInTheDocument();
  });

  describe('when the page text failed', () => {
    it('keeps the card with the last-resort words and no page heading', async () => {
      fetchLiveHealthMock.mockResolvedValue({ status: 'ok' });
      renderView(null);

      expect(screen.queryByRole('heading')).not.toBeInTheDocument();
      expect(await screen.findByText(LAST_RESORT_TEXT.statusOperational)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: LAST_RESORT_TEXT.statusCheckAgain })).toBeVisible();
    });

    it('shows the unreachable word and re-checks on demand', async () => {
      fetchLiveHealthMock.mockRejectedValueOnce(new Error('offline'));
      renderView(null);
      expect(await screen.findByText(LAST_RESORT_TEXT.statusUnreachable)).toBeInTheDocument();

      fetchLiveHealthMock.mockResolvedValue({ status: 'ok' });
      await userEvent.click(
        screen.getByRole('button', { name: LAST_RESORT_TEXT.statusCheckAgain }),
      );
      expect(await screen.findByText(LAST_RESORT_TEXT.statusOperational)).toBeInTheDocument();
    });
  });
});
