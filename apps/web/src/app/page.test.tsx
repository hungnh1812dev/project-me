import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';

import { COPY } from '../configs/Copy.constants';
import { fetchLiveHealth } from '../features/status/Health.api';
import HomePage from './page';

vi.mock('../features/status/Health.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../features/status/Health.api')>()),
  fetchLiveHealth: vi.fn<typeof fetchLiveHealth>().mockResolvedValue({ status: 'ok' }),
}));

describe('HomePage', () => {
  it('renders the status view with no CV content or link', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <HomePage />
      </QueryClientProvider>,
    );
    expect(screen.getByRole('heading', { name: COPY.page.title })).toBeInTheDocument();
    expect(await screen.findByText(COPY.status.state.ok)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: COPY.nav.cv })).not.toBeInTheDocument();
  });
});
