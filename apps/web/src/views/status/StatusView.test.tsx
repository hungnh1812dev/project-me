import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { COPY } from '../../configs/Copy.constants';
import { fetchLiveHealth } from '../../features/status/Health.api';
import { StatusView } from './StatusView';

vi.mock('../../features/status/Health.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../features/status/Health.api')>()),
  fetchLiveHealth: vi.fn<typeof fetchLiveHealth>(),
}));
const fetchLiveHealthMock = vi.mocked(fetchLiveHealth);

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <StatusView />
    </QueryClientProvider>,
  );
}

describe('StatusView', () => {
  beforeEach(() => fetchLiveHealthMock.mockReset());

  it('shows the heading, the description and the BFF health path only', async () => {
    fetchLiveHealthMock.mockResolvedValue({ status: 'ok' });
    renderView();

    expect(screen.getByRole('heading', { level: 1, name: COPY.page.title })).toBeInTheDocument();
    expect(screen.getByText(COPY.page.description)).toBeInTheDocument();
    expect(await screen.findByText(COPY.status.state.ok)).toBeInTheDocument();
    expect(screen.getByText('GET /bff/v1/health')).toBeInTheDocument();
  });

  it('shows the unreachable state and re-checks on demand', async () => {
    fetchLiveHealthMock.mockRejectedValueOnce(new Error('offline'));
    renderView();
    expect(await screen.findByText(COPY.status.state.error)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(COPY.status.errorHint);

    fetchLiveHealthMock.mockResolvedValue({ status: 'ok' });
    await userEvent.click(screen.getByRole('button', { name: COPY.status.checkAgain }));
    expect(await screen.findByText(COPY.status.state.ok)).toBeInTheDocument();
  });
});
