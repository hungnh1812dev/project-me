import { render, screen } from '@testing-library/react';

import { SITE_SHELL_MOCK } from '../apis/server/graphql/mocks/SiteShell.mock';
import { LAST_RESORT_TEXT } from '../features/site-shell';
import { loadSiteShell } from '../features/site-shell/SiteShell.server';
import RootLayout, { generateMetadata } from './layout';

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/server', () => ({ connection: () => Promise.resolve() }));
vi.mock('../features/site-shell/SiteShell.server', () => ({
  loadSiteShell: vi.fn<typeof loadSiteShell>(),
}));
vi.mock('../components/layouts/AccountMenu', () => ({ AccountMenu: () => <div>menu</div> }));
const providersRendered = vi.fn<() => void>();
vi.mock('../components/layouts/AppProviders', () => ({
  Providers: ({ children }: { children: React.ReactNode }) => {
    providersRendered();
    return <>{children}</>;
  },
}));
vi.mock('../components/layouts/CspNonce', () => ({ CspNonce: () => null }));

beforeEach(() => {
  vi.mocked(loadSiteShell).mockResolvedValue({
    ...SITE_SHELL_MOCK,
    header: { ...SITE_SHELL_MOCK.header, nav: [] },
  });
});

describe('RootLayout', () => {
  it('shows the brand, nav label and CV link from the shell text', async () => {
    render(await RootLayout({ children: <p>page</p> }), { container: document.documentElement });
    expect(screen.getByRole('link', { name: SITE_SHELL_MOCK.header.name })).toHaveAttribute(
      'href',
      '/',
    );
    expect(
      screen.getByRole('navigation', { name: SITE_SHELL_MOCK.siteText.navLabel }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: SITE_SHELL_MOCK.siteText.navCvLink })).toHaveAttribute(
      'href',
      '/cv',
    );
  });

  it('titles the page with the brand', async () => {
    expect(await generateMetadata()).toEqual({ title: SITE_SHELL_MOCK.header.name });
  });

  it('renders the page with only the brand when the shell is not published', async () => {
    vi.mocked(loadSiteShell).mockResolvedValue(null);
    render(await RootLayout({ children: <p>page</p> }), { container: document.documentElement });
    expect(screen.getByRole('link', { name: LAST_RESORT_TEXT.appName })).toHaveAttribute(
      'href',
      '/',
    );
    expect(screen.getByText('page')).toBeVisible();
    expect(providersRendered).toHaveBeenCalled();
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(await generateMetadata()).toEqual({ title: LAST_RESORT_TEXT.appName });
  });
});
