import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';

import { MODULE_STATUS_MOCK } from '@/apis/server/graphql/mocks/ModuleStatus.mock';
import { LAST_RESORT_TEXT } from '@/configs/LastResort.constants';
import { fetchLiveHealth } from '@/features/status/Health.api';
import { loadModuleStatusText } from '@/features/status/ModuleStatus.server';

import PageStatus from './PageStatus';

vi.mock('@/features/status/Health.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/status/Health.api')>()),
  fetchLiveHealth: vi.fn<typeof fetchLiveHealth>().mockResolvedValue({ status: 'ok' }),
}));
vi.mock('@/features/status/ModuleStatus.server', () => ({
  loadModuleStatusText: vi.fn<typeof loadModuleStatusText>(),
}));

const TEXT = MODULE_STATUS_MOCK.statusText;

async function renderPage() {
  const page = await PageStatus();
  return render(<QueryClientProvider client={new QueryClient()}>{page}</QueryClientProvider>);
}

describe('PageStatus', () => {
  it('renders the module status text and card with no CV content or link', async () => {
    vi.mocked(loadModuleStatusText).mockResolvedValue(TEXT);
    await renderPage();
    expect(screen.getByRole('heading', { name: TEXT.title })).toBeInTheDocument();
    expect(await screen.findByText(TEXT.stateOk)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'CV' })).not.toBeInTheDocument();
  });

  it('still renders the card when the text failed (criterion 25)', async () => {
    vi.mocked(loadModuleStatusText).mockResolvedValue(null);
    await renderPage();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(await screen.findByText(LAST_RESORT_TEXT.statusOperational)).toBeInTheDocument();
  });
});
