'use client';

import { useState, type FocusEvent, type KeyboardEvent, type ReactNode } from 'react';
import Link from 'next/link';

import type { HeaderNav } from '../../features/site-header/SiteHeader.graphql';
import { isSafeLinkTarget } from '../../utils/SafeLinkTarget.rules';

interface NavEntry {
  title: string | null;
  link: string | null;
  subNavs?: NavEntry[] | null;
}

const NAV_LINK_CLASS = 'text-muted-foreground hover:text-foreground text-sm font-medium';

function NavLink({ title, link }: { title: string; link: string }) {
  if (link.startsWith('/')) {
    return (
      <Link href={link} className={NAV_LINK_CLASS}>
        {title}
      </Link>
    );
  }
  return (
    <a href={link} className={NAV_LINK_CLASS} rel="noopener noreferrer">
      {title}
    </a>
  );
}

/** A nav entry shows with a title and a safe link, or (top level) with a title and a shown sub entry. Display only (D3). */
export function isNavEntryShown(entry: NavEntry): boolean {
  if (!entry.title) return false;
  if (entry.link && isSafeLinkTarget(entry.link)) return true;
  return (entry.subNavs ?? []).some(isNavEntryShown);
}

/** One header.navs item (or sub item). An entry without a safe link but with a shown sub entry is a label. */
function NavItem({ entry, children }: { entry: NavEntry; children?: ReactNode }) {
  const [isSubNavDismissed, setIsSubNavDismissed] = useState(false);
  if (!isNavEntryShown(entry) || !entry.title) return null;
  const dismissSubNav = (event: KeyboardEvent) => {
    if (event.key === 'Escape') setIsSubNavDismissed(true);
  };
  const reopenSubNavWhenFocusLeaves = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setIsSubNavDismissed(false);
  };
  const hasSafeLink = entry.link !== null && isSafeLinkTarget(entry.link);
  return (
    <li className="group relative" data-subnav-dismissed={isSubNavDismissed ? '' : undefined}>
      <div
        role="presentation"
        onKeyDown={dismissSubNav}
        onBlur={reopenSubNavWhenFocusLeaves}
        onMouseLeave={() => setIsSubNavDismissed(false)}
      >
        {hasSafeLink && entry.link ? (
          <NavLink title={entry.title} link={entry.link} />
        ) : (
          <span className={NAV_LINK_CLASS}>{entry.title}</span>
        )}
        {children}
      </div>
    </li>
  );
}

function SubNav({ entries }: { entries: NavEntry[] }) {
  return (
    <ul className="border-border bg-card absolute top-full left-0 z-10 hidden min-w-40 flex-col gap-2 rounded-md border p-3 shadow-sm group-focus-within:flex group-hover:flex group-data-subnav-dismissed:hidden!">
      {entries.map((entry, index) => (
        <NavItem key={`${entry.link}-${index}`} entry={entry} />
      ))}
    </ul>
  );
}

/** Header links: the shown `header.navs` items, each with its `subNavs`. */
export function SiteNav({ navs }: { navs: HeaderNav[] | null }) {
  return (
    <ul className="flex items-center gap-4">
      {(navs ?? []).map((entry, index) => (
        <NavItem key={`${entry.link}-${index}`} entry={entry}>
          {entry.subNavs && entry.subNavs.some(isNavEntryShown) ? (
            <SubNav entries={entry.subNavs} />
          ) : null}
        </NavItem>
      ))}
    </ul>
  );
}
