import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { vi } from 'vitest';

import { MobileNavDrawer } from './MobileNavDrawer';

const NAV = [
  { title: 'CV', link: '/cv', subNavs: null },
  {
    title: 'Library',
    link: '/library',
    subNavs: [
      { title: 'Notes', link: '/library/notes' },
      { title: 'Bad sub', link: 'javascript:alert(1)' },
      { title: 'Elsewhere', link: 'https://example.org/x' },
    ],
  },
  { title: 'Group', link: null, subNavs: [{ title: 'Inner', link: '/inner' }] },
  { title: 'Hash', link: '#', subNavs: null },
  { title: 'Missing', link: null, subNavs: null },
  { title: 'Bad', link: 'javascript:alert(1)', subNavs: null },
];

let mockPathname = '/';
vi.mock('next/navigation', () => ({ usePathname: () => mockPathname }));

type ChangeListener = () => void;
let listeners: ChangeListener[] = [];
let matches = false;
const removeEventListener = vi.fn<(type: string, listener: ChangeListener) => void>(
  (_, listener) => {
    listeners = listeners.filter((l) => l !== listener);
  },
);

beforeEach(() => {
  mockPathname = '/';
  listeners = [];
  matches = false;
  removeEventListener.mockClear();
  window.matchMedia = vi.fn<() => unknown>(() => ({
    get matches() {
      return matches;
    },
    addEventListener: (_: string, listener: ChangeListener) => listeners.push(listener),
    removeEventListener,
  })) as unknown as typeof window.matchMedia;
});

const openDrawer = () => fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));

describe('MobileNavDrawer', () => {
  it('renders nothing when no entry is shown', () => {
    const { container } = render(<MobileNavDrawer navs={NAV.slice(3)} appName="Abyss" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('names the button and flips aria-expanded', () => {
    render(<MobileNavDrawer navs={NAV} appName="Abyss" />);
    const button = screen.getByRole('button', { name: 'Open menu' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('dialog', { name: 'Abyss' })).toBeInTheDocument();
  });

  it('lists entries and sub entries in stored order', () => {
    render(<MobileNavDrawer navs={NAV} appName="Abyss" />);
    openDrawer();
    const dialog = screen.getByRole('dialog');
    const links = within(dialog).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual([
      'CV',
      'Library',
      'Notes',
      'Elsewhere',
      'Inner',
    ]);
    expect(within(dialog).getByText('Group').closest('a, button')).toBeNull();
    expect(within(dialog).queryByText('Bad sub')).toBeNull();
    expect(within(dialog).queryByText('Hash')).toBeNull();
    expect(within(dialog).queryByText('Missing')).toBeNull();
    expect(within(dialog).getByText('Elsewhere')).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('closes on a link click', () => {
    render(<MobileNavDrawer navs={NAV} appName="Abyss" />);
    openDrawer();
    fireEvent.click(screen.getByRole('link', { name: 'CV' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes on the close button and on Escape', () => {
    render(<MobileNavDrawer navs={NAV} appName="Abyss" />);
    openDrawer();
    fireEvent.click(screen.getByRole('button', { name: 'Close menu' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    openDrawer();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes when the pathname changes', () => {
    const { rerender } = render(<MobileNavDrawer navs={NAV} appName="Abyss" />);
    openDrawer();
    mockPathname = '/cv';
    rerender(<MobileNavDrawer navs={NAV} appName="Abyss" />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes when the desktop media query matches, and drops its listener', () => {
    const { unmount } = render(<MobileNavDrawer navs={NAV} appName="Abyss" />);
    openDrawer();
    expect(listeners).toHaveLength(1);
    matches = true;
    act(() => listeners.forEach((l) => l()));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(removeEventListener).toHaveBeenCalled();
    unmount();
  });

  it('returns focus to the menu button on close', async () => {
    render(<MobileNavDrawer navs={NAV} appName="Abyss" />);
    openDrawer();
    fireEvent.click(screen.getByRole('button', { name: 'Close menu' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open menu' })).toHaveFocus());
  });
});
