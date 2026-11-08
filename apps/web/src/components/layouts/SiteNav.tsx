'use client';

import { useState, type FocusEvent, type KeyboardEvent, type ReactNode } from 'react';
import Link from 'next/link';

import { useCanSee } from '../../features/session';
import { useRequiredSiteText, useSiteHeader } from '../../features/site-shell';
import { isSafeLinkTarget } from '../../utils/SafeLinkTarget.rules';

interface NavEntry {
  title: string | null;
  link: string | null;
  requiresRole: string | null;
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

/** One header.nav item (or sub item): shown when the viewer may see it and its link is safe. Display only (D3). */
function NavItem({ entry, children }: { entry: NavEntry; children?: ReactNode }) {
  const canSee = useCanSee(entry.requiresRole);
  const [isSubNavDismissed, setIsSubNavDismissed] = useState(false);
  if (!canSee || !entry.title || !entry.link || !isSafeLinkTarget(entry.link)) return null;
  const dismissSubNav = (event: KeyboardEvent) => {
    if (event.key === 'Escape') setIsSubNavDismissed(true);
  };
  const reopenSubNavWhenFocusLeaves = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setIsSubNavDismissed(false);
  };
  return (
    <li className="group relative" data-subnav-dismissed={isSubNavDismissed ? '' : undefined}>
      <div
        role="presentation"
        onKeyDown={dismissSubNav}
        onBlur={reopenSubNavWhenFocusLeaves}
        onMouseLeave={() => setIsSubNavDismissed(false)}
      >
        <NavLink title={entry.title} link={entry.link} />
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

/** Header links: the CV link first, then the `header.nav` items the viewer may see. */
export function SiteNav() {
  const text = useRequiredSiteText();
  const nav = useSiteHeader()?.nav ?? [];
  return (
    <ul className="flex items-center gap-4">
      <li>
        <Link href="/cv" className={NAV_LINK_CLASS}>
          {text.navCvLink}
        </Link>
      </li>
      {nav.map((entry, index) => (
        <NavItem key={`${entry.link}-${index}`} entry={entry}>
          {entry.subNavigations && entry.subNavigations.length > 0 ? (
            <SubNav entries={entry.subNavigations} />
          ) : null}
        </NavItem>
      ))}
    </ul>
  );
}
