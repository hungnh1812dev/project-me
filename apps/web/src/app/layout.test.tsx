import { render, screen } from '@testing-library/react';

import { SITE_HEADER_MOCK } from '../apis/server/graphql/mocks/SiteHeader.mock';
import { LAST_RESORT_TEXT } from '../configs/LastResort.constants';
import { loadSiteHeader } from '../features/site-header/SiteHeader.server';
import RootLayout, { generateMetadata } from './layout';

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/server', () => ({ connection: () => Promise.resolve() }));
vi.mock('../features/site-header/SiteHeader.server', () => ({
  loadSiteHeader: vi.fn<typeof loadSiteHeader>(),
}));
vi.mock('../components/layouts/SiteHeader', () => ({ SiteHeader: () => <header>header</header> }));
const providersRendered = vi.fn<() => void>();
vi.mock('../components/layouts/AppProviders', () => ({
  Providers: ({ children }: { children: React.ReactNode }) => {
    providersRendered();
    return <>{children}</>;
  },
}));
vi.mock('../components/layouts/CspNonce', () => ({ CspNonce: () => null }));

describe('RootLayout', () => {
  it('renders the header and the page inside the providers', async () => {
    render(await RootLayout({ children: <p>page</p> }), { container: document.documentElement });
    expect(screen.getByText('header')).toBeVisible();
    expect(screen.getByRole('main')).toHaveTextContent('page');
    expect(providersRendered).toHaveBeenCalled();
  });

  it('titles the page with the brand', async () => {
    vi.mocked(loadSiteHeader).mockResolvedValue({
      header: { ...SITE_HEADER_MOCK.header, navs: [] },
    });
    expect(await generateMetadata()).toEqual({ title: SITE_HEADER_MOCK.header.appName });
  });

  it('titles the page with the last-resort brand when the header did not load', async () => {
    vi.mocked(loadSiteHeader).mockResolvedValue(null);
    expect(await generateMetadata()).toEqual({ title: LAST_RESORT_TEXT.appName });
  });
});
