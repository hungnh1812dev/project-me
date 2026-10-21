import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { COPY } from '../config/copy.constants';
import { fetchLiveHealth } from '../features/status/health.api';
import HomePage from './page';

vi.mock('../features/status/health.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../features/status/health.api')>()),
  fetchLiveHealth: vi.fn<typeof fetchLiveHealth>(),
}));

const fetchLiveHealthMock = vi.mocked(fetchLiveHealth);

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <HomePage />
    </QueryClientProvider>,
  );
}

describe('HomePage', () => {
  beforeEach(() => {
    fetchLiveHealthMock.mockReset();
  });

  it('renders the status page and reports a healthy API', async () => {
    fetchLiveHealthMock.mockResolvedValue({ status: 'ok' });
    renderPage();

    expect(
      screen.getByRole('heading', { level: 1, name: COPY.page.title }),
    ).toBeInTheDocument();
    expect(await screen.findByText(COPY.status.state.ok)).toBeInTheDocument();
    expect(screen.getByText(/\/api\/v1\/health\/live$/)).toBeInTheDocument();
    // The button comes from @abyss/form-commons.
    expect(
      screen.getByRole('button', { name: COPY.status.checkAgain }),
    ).toHaveAttribute('data-slot', 'button');
  });

  it('shows the error state and recovers on "check again"', async () => {
    fetchLiveHealthMock
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockResolvedValue({ status: 'ok' });
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      COPY.status.errorHint,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      COPY.status.state.error,
    );

    await userEvent.click(
      screen.getByRole('button', { name: COPY.status.checkAgain }),
    );

    expect(await screen.findByText(COPY.status.state.ok)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('treats an unexpected health body as unreachable', async () => {
    fetchLiveHealthMock.mockResolvedValue({ status: 'error' });
    renderPage();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
