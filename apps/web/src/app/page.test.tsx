import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';

import { STATUS_PAGE_MOCK } from '@/apis/server/graphql/mocks/StatusPage.mock';
import { LAST_RESORT_TEXT } from '@/features/site-shell';

import { fetchLiveHealth } from '../features/status/Health.api';
import { loadStatusPage } from '../features/status/StatusPage.server';
import HomePage from './page';

vi.mock('../features/status/Health.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../features/status/Health.api')>()),
  fetchLiveHealth: vi.fn<typeof fetchLiveHealth>().mockResolvedValue({ status: 'ok' }),
}));
vi.mock('../features/status/StatusPage.server', () => ({
  loadStatusPage: vi.fn<typeof loadStatusPage>(),
}));

const TEXT = STATUS_PAGE_MOCK.statusPageText;

async function renderPage() {
  const page = await HomePage();
  return render(<QueryClientProvider client={new QueryClient()}>{page}</QueryClientProvider>);
}

describe('HomePage', () => {
  it('renders the status page text and card with no CV content or link', async () => {
    vi.mocked(loadStatusPage).mockResolvedValue(TEXT);
    await renderPage();
    expect(screen.getByRole('heading', { name: TEXT.title })).toBeInTheDocument();
    expect(await screen.findByText(TEXT.stateOk)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'CV' })).not.toBeInTheDocument();
  });

  it('still renders the card when the page text failed (criterion 25)', async () => {
    vi.mocked(loadStatusPage).mockResolvedValue(null);
    await renderPage();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(await screen.findByText(LAST_RESORT_TEXT.statusOperational)).toBeInTheDocument();
  });
});
