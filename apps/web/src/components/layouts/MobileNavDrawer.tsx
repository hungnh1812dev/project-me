'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '@abyss/form-commons';

import { MOBILE_NAV_TEXT } from '../../configs/LastResort.constants';
import { isNavEntryShown, NavLink, type NavEntry } from './SiteNav';

/** Must equal Tailwind `md`: the width from which the header bar shows the entries instead of the drawer. */
const DESKTOP_NAV_MEDIA_QUERY = '(min-width: 48rem)';

const ICON_BUTTON_CLASS =
  'text-foreground hover:bg-muted focus-visible:ring-ring inline-flex size-11 shrink-0 items-center justify-center rounded-item focus-visible:ring-2 focus-visible:outline-none';
const PANEL_CLASS =
  'top-0 right-0 left-auto flex h-dvh max-h-none w-72 max-w-[calc(100%-3rem)] translate-x-0 translate-y-0 flex-col gap-0 rounded-none rounded-l-surface p-0 transition-transform duration-(--duration-base) ease-out starting:translate-x-full data-[state=open]:animate-none motion-reduce:transition-none';
const ROW_CLASS = 'text-foreground flex min-h-11 items-center text-sm font-medium';

function MenuIcon({ isClose }: { isClose: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      {isClose ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 6h16M4 12h16M4 18h16" />}
    </svg>
  );
}

function DrawerEntry({
  entry,
  isSub,
  onNavigate,
}: {
  entry: NavEntry;
  isSub: boolean;
  onNavigate: () => void;
}) {
  if (!isNavEntryShown(entry) || !entry.title) return null;
  const subEntries = (entry.subNavs ?? []).filter(isNavEntryShown);
  const indentClass = isSub ? 'pl-4' : '';
  const hasLink = entry.link !== null && isNavEntryShown({ ...entry, subNavs: null });
  return (
    <li>
      {hasLink && entry.link ? (
        <NavLink
          title={entry.title}
          link={entry.link}
          className={`${ROW_CLASS} ${indentClass}`}
          onClick={onNavigate}
        />
      ) : (
        <span className={`${ROW_CLASS} text-muted-foreground ${indentClass}`}>{entry.title}</span>
      )}
      {subEntries.length > 0 ? (
        <ul className="flex flex-col">
          {subEntries.map((sub, index) => (
            <DrawerEntry key={`${sub.link}-${index}`} entry={sub} isSub onNavigate={onNavigate} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function DrawerNavList({ navs, onNavigate }: { navs: NavEntry[]; onNavigate: () => void }) {
  return (
    <ul className="flex flex-col gap-1 overflow-y-auto px-4 py-3">
      {navs.map((entry, index) => (
        <DrawerEntry
          key={`${entry.link}-${index}`}
          entry={entry}
          isSub={false}
          onNavigate={onNavigate}
        />
      ))}
    </ul>
  );
}

/** The header's menu button on phones and the side panel it opens with the same entries as the bar (PS-6). */
export function MobileNavDrawer({ navs, appName }: { navs: NavEntry[]; appName: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const [openedAtPathname, setOpenedAtPathname] = useState(pathname);
  if (openedAtPathname !== pathname) {
    setOpenedAtPathname(pathname);
    setIsOpen(false);
  }

  useEffect(() => {
    if (!isOpen) return;
    const query = window.matchMedia(DESKTOP_NAV_MEDIA_QUERY);
    const closeWhenDesktop = () => {
      if (query.matches) setIsOpen(false);
    };
    query.addEventListener('change', closeWhenDesktop);
    return () => query.removeEventListener('change', closeWhenDesktop);
  }, [isOpen]);

  if (!navs.some(isNavEntryShown)) return null;
  const close = () => setIsOpen(false);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className={`${ICON_BUTTON_CLASS} print:hidden`}
          aria-label={MOBILE_NAV_TEXT.openMenu}
        >
          <MenuIcon isClose={false} />
        </button>
      </DialogTrigger>
      <DialogContent className={`${PANEL_CLASS} print:hidden`} aria-describedby={undefined}>
        <div className="border-border flex items-center justify-between gap-3 border-b py-2 pr-2 pl-4">
          <DialogTitle className="text-sm">{appName}</DialogTitle>
          <DialogClose asChild>
            <button
              type="button"
              className={ICON_BUTTON_CLASS}
              aria-label={MOBILE_NAV_TEXT.closeMenu}
            >
              <MenuIcon isClose />
            </button>
          </DialogClose>
        </div>
        <DrawerNavList navs={navs} onNavigate={close} />
      </DialogContent>
    </Dialog>
  );
}
