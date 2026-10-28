import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { notFound } from 'next/navigation';

import { COPY } from '../../config/Copy.constants';
import { fetchLiveHealth } from '../../features/status/Health.api';
import { getServerEnv } from '../../config/Server.env';
import StatusPage from './page';

vi.mock('../../features/status/Health.api', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../features/status/Health.api')
  >()),
  fetchLiveHealth: vi.fn<typeof fetchLiveHealth>(),
}));

vi.mock('next/navigation', () => ({
  notFound: vi.fn<typeof notFound>(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));
vi.mock('next/server', () => ({
  connection: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));
vi.mock('../../config/Server.env', () => ({
  getServerEnv: vi.fn<typeof getServerEnv>(),
}));

const getServerEnvMock = vi.mocked(getServerEnv);
const fetchLiveHealthMock = vi.mocked(fetchLiveHealth);

async function renderPage() {
  const page = await StatusPage();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{page}</QueryClientProvider>,
  );
}

describe('StatusPage', () => {
  beforeEach(() => {
    fetchLiveHealthMock.mockReset();
    getServerEnvMock.mockReturnValue({
      apiInternalUrl: 'http://cms-api:3000/api/v1',
      revalidateSeconds: 0,
      isStatusPageEnabled: true,
    });
  });

  it('answers not found while the switch is off', async () => {
    getServerEnvMock.mockReturnValue({
      apiInternalUrl: 'http://cms-api:3000/api/v1',
      revalidateSeconds: 0,
      isStatusPageEnabled: false,
    });
    await expect(StatusPage()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('renders the status page and reports a healthy API', async () => {
    fetchLiveHealthMock.mockResolvedValue({ status: 'ok' });
    await renderPage();

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
    await renderPage();

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
    await renderPage();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
