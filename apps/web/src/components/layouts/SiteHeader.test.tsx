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
  SiteNav: ({ cvLinkText }: { cvLinkText: string | null }) => <span>{cvLinkText}</span>,
}));

/** `SiteHeader` is an async server component: its function is awaited, then its result rendered. */
async function renderHeader() {
  return render(await SiteHeader());
}

beforeEach(() => {
  vi.mocked(loadSiteHeader).mockResolvedValue({
    header: { ...SITE_HEADER_MOCK.header, nav: [] },
  });
  vi.mocked(loadSignInText).mockResolvedValue(SIGN_IN_MOCK.signInText);
});

describe('SiteHeader', () => {
  it('shows the brand, the nav label and the account menu from the loaded text', async () => {
    await renderHeader();
    expect(screen.getByRole('link', { name: SITE_HEADER_MOCK.header.name })).toHaveAttribute(
      'href',
      '/',
    );
    expect(
      screen.getByRole('navigation', { name: SITE_HEADER_MOCK.header.navLabel }),
    ).toBeVisible();
    expect(screen.getByText(SITE_HEADER_MOCK.header.navCvLink)).toBeVisible();
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
});
