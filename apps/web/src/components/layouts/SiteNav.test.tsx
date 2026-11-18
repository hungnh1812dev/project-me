import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { SITE_HEADER_MOCK } from '@/apis/server/graphql/mocks/SiteHeader.mock';

import { WebSessionProvider } from '../../features/session';
import type { AuthApi } from '../../features/session/Auth.api';
import { fakeApi, TEST_USER } from '../../features/session/Session.fixture';
import { SiteNav } from './SiteNav';

const NAV = [
  { title: 'Blog', link: '/blog', requiresRole: null, subNavigations: null },
  {
    title: 'Library',
    link: '/library',
    requiresRole: 'reader',
    subNavigations: [
      { title: 'Notes', link: '/library/notes', requiresRole: null },
      { title: 'Vault', link: '/library/vault', requiresRole: 'editor' },
    ],
  },
  { title: 'Bad', link: 'javascript:alert(1)', requiresRole: null, subNavigations: null },
  { title: null, link: '/untitled', requiresRole: null, subNavigations: null },
];

function renderNav(user: typeof TEST_USER | null, nav = NAV) {
  const api = fakeApi({ readSession: vi.fn<AuthApi['readSession']>().mockResolvedValue(user) });
  const Providers = ({ children }: { children: ReactNode }) => (
    <WebSessionProvider api={api}>{children}</WebSessionProvider>
  );
  return render(<SiteNav nav={nav} cvLinkText={SITE_HEADER_MOCK.header.navCvLink} />, {
    wrapper: Providers,
  });
}

describe('SiteNav', () => {
  it('shows only the CV link when header.nav is empty', async () => {
    renderNav(null, []);
    expect(await screen.findAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('link', { name: SITE_HEADER_MOCK.header.navCvLink })).toHaveAttribute(
      'href',
      '/cv',
    );
  });

  it('puts the CV link first, hides role items when signed out and drops unsafe or untitled items', async () => {
    renderNav(null);
    await screen.findByRole('link', { name: 'Blog' });
    const names = screen.getAllByRole('link').map((link) => link.textContent);
    expect(names).toEqual([SITE_HEADER_MOCK.header.navCvLink, 'Blog']);
  });

  it('shows an item to a signed-in viewer with its role, and only the sub items they may see', async () => {
    renderNav({ ...TEST_USER, role: 'reader' });
    await screen.findByRole('link', { name: 'Library' });
    expect(screen.getByRole('link', { name: 'Notes' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Vault' })).not.toBeInTheDocument();
  });

  it('hides a role item from a viewer with another role', async () => {
    renderNav({ ...TEST_USER, role: 'viewer' });
    await screen.findByRole('link', { name: 'Blog' });
    expect(screen.queryByRole('link', { name: 'Library' })).not.toBeInTheDocument();
  });

  it('marks the sub menu dismissed on Escape and clears it when focus leaves', async () => {
    renderNav({ ...TEST_USER, role: 'reader' });
    const parent = await screen.findByRole('link', { name: 'Library' });
    const item = parent.closest('li')!;
    parent.focus();
    fireEvent.keyDown(parent, { key: 'Escape' });
    expect(item).toHaveAttribute('data-subnav-dismissed');
    fireEvent.blur(parent, { relatedTarget: document.body });
    expect(item).not.toHaveAttribute('data-subnav-dismissed');
  });
});
