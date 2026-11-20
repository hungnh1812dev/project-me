import { render, screen } from '@testing-library/react';

import { SIGN_IN_MOCK } from '../../apis/server/graphql/mocks/SignIn.mock';
import { SITE_HEADER_MOCK } from '../../apis/server/graphql/mocks/SiteHeader.mock';
import { LAST_RESORT_TEXT } from '../../configs/LastResort.constants';
import { loadSignInText } from '../../features/auth/SignIn.server';
import { loadSiteHeader } from '../../features/site-header/SiteHeader.server';
import { SiteHeader } from './SiteHeader';

vi.mock('../../features/site-header/SiteHeader.server', () => ({
  loadSiteHeader: vi.fn<typeof loadSiteHeader>(),
}));
vi.mock('../../features/auth/SignIn.server', () => ({
  loadSignInText: vi.fn<typeof loadSignInText>(),
}));
vi.mock('./AccountMenu', () => ({
  AccountMenu: ({ signInText }: { signInText: unknown }) => (
    <div>{signInText === null ? 'menu without sign-in' : 'menu'}</div>
  ),
}));
vi.mock('./SiteNav', () => ({
  SiteNav: ({ navs }: { navs: { title: string | null }[] | null }) => (
    <span>{navs?.map((nav) => nav.title).join(',')}</span>
  ),
}));

/** `SiteHeader` is an async server component: its function is awaited, then its result rendered. */
async function renderHeader() {
  return render(await SiteHeader());
}

beforeEach(() => {
  vi.mocked(loadSiteHeader).mockResolvedValue({
    header: {
      appName: SITE_HEADER_MOCK.header.appName,
      navs: [{ title: 'CV', link: '/status', subNavs: [] }],
      author: SITE_HEADER_MOCK.header.author,
    },
  });
  vi.mocked(loadSignInText).mockResolvedValue(SIGN_IN_MOCK.signInText);
});

vi.mock('./MobileNavDrawer', () => ({
  MobileNavDrawer: ({ navs, appName }: { navs: { title: string | null }[]; appName: string }) => (
    <button type="button">{`drawer ${appName}: ${navs.map((nav) => nav.title).join(',')}`}</button>
  ),
}));

describe('SiteHeader', () => {
  it('shows the brand, the nav and the account menu from the loaded text', async () => {
    await renderHeader();
    expect(screen.getByRole('link', { name: SITE_HEADER_MOCK.header.appName })).toHaveAttribute(
      'href',
      '/',
    );
    expect(screen.getByRole('navigation')).not.toHaveAttribute('aria-label');
    expect(screen.getByText('CV')).toBeVisible();
    expect(screen.getByText('menu')).toBeVisible();
  });

  it('holds only the last-resort brand when the header did not load', async () => {
    vi.mocked(loadSiteHeader).mockResolvedValue(null);
    await renderHeader();
    expect(screen.getByRole('link', { name: LAST_RESORT_TEXT.appName })).toHaveAttribute(
      'href',
      '/',
    );
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('hands the account menu no sign-in text when it did not load', async () => {
    vi.mocked(loadSignInText).mockResolvedValue(null);
    await renderHeader();
    expect(screen.getByText('menu without sign-in')).toBeVisible();
    expect(screen.getByRole('navigation')).toBeVisible();
  });

  it('still loads the sign-in text when the header did not', async () => {
    vi.mocked(loadSiteHeader).mockResolvedValue(null);
    await renderHeader();
    expect(loadSignInText).toHaveBeenCalled();
  });

  it('gives the drawer the same entries and app name, one wrapper per width', async () => {
    await renderHeader();
    const drawer = screen.getByRole('button', {
      name: `drawer ${SITE_HEADER_MOCK.header.appName}: CV`,
    });
    expect(drawer.parentElement).toHaveClass('md:hidden');
    expect(screen.getByText('CV').parentElement).toHaveClass('hidden', 'md:flex');
  });

  it('has no menu button when the header did not load', async () => {
    vi.mocked(loadSiteHeader).mockResolvedValue(null);
    await renderHeader();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
