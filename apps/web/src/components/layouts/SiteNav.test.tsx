import { fireEvent, render, screen } from '@testing-library/react';

import { SiteNav } from './SiteNav';

const NAV = [
  { title: 'CV', link: '/cv', subNavs: null },
  { title: 'Blog', link: '/blog', subNavs: null },
  {
    title: 'Library',
    link: '/library',
    subNavs: [
      { title: 'Notes', link: '/library/notes' },
      { title: 'Vault', link: '/library/vault' },
      { title: 'Bad sub', link: 'javascript:alert(1)' },
    ],
  },
  {
    title: 'Group',
    link: 'javascript:alert(1)',
    subNavs: [{ title: 'Inner', link: '/inner' }],
  },
  { title: 'Bad', link: 'javascript:alert(1)', subNavs: null },
  { title: null, link: '/untitled', subNavs: null },
  {
    title: 'Dead group',
    link: null,
    subNavs: [{ title: 'Nope', link: 'javascript:alert(1)' }],
  },
];

describe('SiteNav', () => {
  it('shows nothing when navs is empty', () => {
    render(<SiteNav navs={[]} />);
    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('renders every titled entry with a safe link, without a session provider', () => {
    render(<SiteNav navs={NAV} />);
    const names = screen.getAllByRole('link').map((link) => link.textContent);
    expect(names).toEqual(['CV', 'Blog', 'Library', 'Notes', 'Vault', 'Inner']);
  });

  it('never renders an unsafe link', () => {
    render(<SiteNav navs={NAV} />);
    for (const link of screen.getAllByRole('link')) {
      expect(link.getAttribute('href')).not.toMatch(/^javascript:/);
    }
    expect(screen.queryByText('Bad')).not.toBeInTheDocument();
    expect(screen.queryByText('Bad sub')).not.toBeInTheDocument();
  });

  it('drops the link of an entry with a shown sub entry and keeps it as a label', () => {
    render(<SiteNav navs={NAV} />);
    expect(screen.getByText('Group').closest('a')).toBeNull();
    expect(screen.getByRole('link', { name: 'Inner' })).toBeInTheDocument();
  });

  it('leaves out an untitled entry and an entry with no shown sub entry and no link', () => {
    render(<SiteNav navs={NAV} />);
    expect(screen.queryByText('/untitled')).not.toBeInTheDocument();
    expect(screen.queryByText('Dead group')).not.toBeInTheDocument();
  });

  it('marks the sub menu dismissed on Escape and clears it when focus leaves', () => {
    render(<SiteNav navs={NAV} />);
    const parent = screen.getByRole('link', { name: 'Library' });
    const item = parent.closest('li')!;
    parent.focus();
    fireEvent.keyDown(parent, { key: 'Escape' });
    expect(item).toHaveAttribute('data-subnav-dismissed');
    fireEvent.blur(parent, { relatedTarget: document.body });
    expect(item).not.toHaveAttribute('data-subnav-dismissed');
  });
});
