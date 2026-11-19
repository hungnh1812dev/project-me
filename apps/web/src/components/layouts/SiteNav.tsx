'use client';

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type MouseEventHandler,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from 'react';
import Link from 'next/link';

import type { HeaderNav } from '../../features/site-header/SiteHeader.graphql';
import { isSafeLinkTarget } from '../../utils/SafeLinkTarget.rules';

interface NavEntry {
  title: string | null;
  link: string | null;
  subNavs?: NavEntry[] | null;
}

const TOUCH_POINTER = 'touch';

const NAV_LINK_CLASS = 'text-muted-foreground hover:text-foreground text-sm font-medium';

interface TriggerProps {
  title: string;
  ref: Ref<HTMLAnchorElement & HTMLButtonElement>;
  onClick?: MouseEventHandler<HTMLAnchorElement & HTMLButtonElement> | undefined;
  'aria-expanded'?: boolean;
  'aria-controls'?: string;
}

function NavLink({ title, link, ref, onClick, ...aria }: TriggerProps & { link: string }) {
  if (link.startsWith('/')) {
    return (
      <Link
        href={link}
        className={NAV_LINK_CLASS}
        ref={ref}
        {...(onClick ? { onClick } : {})}
        {...aria}
      >
        {title}
      </Link>
    );
  }
  return (
    <a
      href={link}
      className={NAV_LINK_CLASS}
      rel="noopener noreferrer"
      ref={ref}
      onClick={onClick}
      {...aria}
    >
      {title}
    </a>
  );
}

/** An entry with sub entries and no safe link: opens its list on click, tap, hover and focus. */
function NavLabel({ title, ref, onClick, ...aria }: TriggerProps) {
  return (
    <button type="button" className={NAV_LINK_CLASS} ref={ref} onClick={onClick} {...aria}>
      {title}
    </button>
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
  const [isSubNavOpen, setIsSubNavOpen] = useState(false);
  const itemRef = useRef<HTMLLIElement>(null);
  const triggerRef = useRef<(HTMLAnchorElement & HTMLButtonElement) | null>(null);
  const isRestoringFocusRef = useRef(false);
  const isFirstTouchTapRef = useRef(false);
  const subNavId = useId();
  const hasSubNav = Boolean(children);

  useEffect(() => {
    if (!isSubNavOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!itemRef.current?.contains(event.target as Node)) setIsSubNavOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [isSubNavOpen]);

  if (!isNavEntryShown(entry) || !entry.title) return null;
  const hasSafeLink = entry.link !== null && isSafeLinkTarget(entry.link);

  const closeOnEscape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !isSubNavOpen) return;
    setIsSubNavOpen(false);
    isRestoringFocusRef.current = true;
    triggerRef.current?.focus();
    isRestoringFocusRef.current = false;
  };
  const openWhenFocusEnters = (event: FocusEvent<HTMLDivElement>) => {
    if (isRestoringFocusRef.current) return;
    if (!event.currentTarget.contains(event.relatedTarget)) setIsSubNavOpen(true);
  };
  const closeWhenFocusLeaves = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setIsSubNavOpen(false);
  };
  const rememberTouchTap = (event: ReactPointerEvent<HTMLDivElement>) => {
    isFirstTouchTapRef.current = event.pointerType === TOUCH_POINTER && !isSubNavOpen;
  };
  const openOnLabelClick = () => setIsSubNavOpen(true);
  const openOnFirstTouchTap = (event: MouseEvent<HTMLAnchorElement & HTMLButtonElement>) => {
    if (!isFirstTouchTapRef.current) return;
    isFirstTouchTapRef.current = false;
    event.preventDefault();
    setIsSubNavOpen(true);
  };
  const triggerProps = {
    title: entry.title,
    ref: triggerRef,
    ...(hasSubNav ? { 'aria-expanded': isSubNavOpen, 'aria-controls': subNavId } : {}),
  };

  return (
    <li
      ref={itemRef}
      className="group relative"
      data-subnav-open={hasSubNav && isSubNavOpen ? '' : undefined}
    >
      <div
        role="presentation"
        onKeyDown={hasSubNav ? closeOnEscape : undefined}
        onFocus={hasSubNav ? openWhenFocusEnters : undefined}
        onBlur={hasSubNav ? closeWhenFocusLeaves : undefined}
        onMouseEnter={hasSubNav ? () => setIsSubNavOpen(true) : undefined}
        onMouseLeave={hasSubNav ? () => setIsSubNavOpen(false) : undefined}
        onPointerDown={hasSubNav ? rememberTouchTap : undefined}
      >
        {hasSafeLink && entry.link ? (
          <NavLink
            {...triggerProps}
            link={entry.link}
            onClick={hasSubNav ? openOnFirstTouchTap : undefined}
          />
        ) : hasSubNav ? (
          <NavLabel {...triggerProps} onClick={openOnLabelClick} />
        ) : (
          <span className={NAV_LINK_CLASS}>{entry.title}</span>
        )}
        {hasSubNav ? <div id={subNavId}>{children}</div> : null}
      </div>
    </li>
  );
}

function SubNav({ entries }: { entries: NavEntry[] }) {
  return (
    <ul className="border-border bg-card absolute top-full left-0 z-10 hidden min-w-40 flex-col gap-2 rounded-md border p-3 shadow-sm group-data-subnav-open:flex">
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
