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

  it('renders an entry with sub entries and no safe link as a button that opens its list', () => {
    render(<SiteNav navs={NAV} />);
    const label = screen.getByRole('button', { name: 'Group' });
    expect(label).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById(label.getAttribute('aria-controls')!)).toContainElement(
      screen.getByRole('link', { name: 'Inner', hidden: true }),
    );
    fireEvent.click(label);
    expect(label).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(label);
    expect(label).toHaveAttribute('aria-expanded', 'true');
  });

  it('opens the list on focus and on hover, and closes it when focus or the pointer leaves', () => {
    render(<SiteNav navs={NAV} />);
    const label = screen.getByRole('button', { name: 'Group' });
    fireEvent.focus(label);
    expect(label).toHaveAttribute('aria-expanded', 'true');
    fireEvent.blur(label, { relatedTarget: document.body });
    expect(label).toHaveAttribute('aria-expanded', 'false');
    const item = label.closest('li')!;
    fireEvent.mouseEnter(item.firstElementChild!);
    expect(label).toHaveAttribute('aria-expanded', 'true');
    fireEvent.mouseLeave(item.firstElementChild!);
    expect(label).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes on Escape and keeps focus on the entry', () => {
    render(<SiteNav navs={NAV} />);
    const parent = screen.getByRole('link', { name: 'Library' });
    fireEvent.focus(parent);
    fireEvent.keyDown(screen.getByRole('link', { name: 'Notes' }), { key: 'Escape' });
    expect(parent).toHaveAttribute('aria-expanded', 'false');
    expect(parent).toHaveFocus();
  });

  it('keeps the sub entries in stored order', () => {
    render(<SiteNav navs={NAV} />);
    const list = document.getElementById(
      screen.getByRole('link', { name: 'Library' }).getAttribute('aria-controls')!,
    )!;
    expect(Array.from(list.querySelectorAll('a')).map((a) => a.textContent)).toEqual([
      'Notes',
      'Vault',
    ]);
  });

  it('follows a linked entry at once on a mouse click', () => {
    render(<SiteNav navs={NAV} />);
    const parent = screen.getByRole('link', { name: 'Library' });
    fireEvent.pointerDown(parent, { pointerType: 'mouse' });
    expect(fireEvent.click(parent)).toBe(true);
  });

  it('opens the list on the first touch tap and follows the link on the second', () => {
    render(<SiteNav navs={NAV} />);
    const parent = screen.getByRole('link', { name: 'Library' });
    fireEvent.pointerDown(parent, { pointerType: 'touch' });
    expect(fireEvent.click(parent)).toBe(false);
    expect(parent).toHaveAttribute('aria-expanded', 'true');
    fireEvent.pointerDown(parent, { pointerType: 'touch' });
    expect(fireEvent.click(parent)).toBe(true);
  });

  it('closes the list on a tap outside', () => {
    render(<SiteNav navs={NAV} />);
    const parent = screen.getByRole('link', { name: 'Library' });
    fireEvent.focus(parent);
    expect(parent).toHaveAttribute('aria-expanded', 'true');
    fireEvent.pointerDown(document.body);
    expect(parent).toHaveAttribute('aria-expanded', 'false');
  });
});
