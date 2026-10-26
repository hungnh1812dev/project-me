import { Button } from '@abyss/form-commons';
import { useState } from 'react';
import { Link, NavLink } from 'react-router';

import { REVIEWER_ROLE_SLUG } from '../config/auth.constants';
import { COPY } from '../config/copy.constants';
import { APP_ROUTES } from '../config/routes';
import { useCallerAccess } from '../features/access/caller-access';
import { useCurrentUser, useSession } from '../features/auth';
import { FEATURE_LIST } from '../features/registry';
import type { FeatureNavItem, NavItemsState } from '../lib/feature-definition';
import {
  collectLeafIds,
  DATA_BACKED_SECTION_ID,
  NAV_SECTIONS,
} from '../lib/nav-sections';

const SKELETON_ROW_COUNT = 3;

const STATIC_NAV_ITEMS = FEATURE_LIST.flatMap(
  (feature) => feature.navItems ?? [],
);
const DATA_BACKED_NAV_HOOKS = FEATURE_LIST.flatMap((feature) =>
  feature.useNavItems ? [feature.useNavItems] : [],
);

const LINK_CLASS =
  'block rounded-md border-l-2 px-3 py-1.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';
const LINK_ACTIVE_CLASS =
  'border-primary bg-primary/10 font-medium text-foreground';
const LINK_IDLE_CLASS =
  'border-transparent text-muted-foreground hover:bg-accent hover:text-foreground';

interface MenuProps {
  /** Called after a link is chosen; the mobile sheet closes itself with it. */
  onNavigate?: (() => void) | undefined;
}

interface MenuState {
  isReady: boolean;
  items: readonly FeatureNavItem[];
  isCatalogLoading: boolean;
  catalogFailure: NavItemsState | undefined;
}

function useMenuState(): MenuState {
  const caller = useCallerAccess();
  // The hook list is a module constant, so the call order never changes.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const dataBacked = DATA_BACKED_NAV_HOOKS.map((useNavItems) => useNavItems());
  const items = [
    ...STATIC_NAV_ITEMS,
    ...dataBacked.flatMap((state) => state.items),
  ].filter((item) => caller.can(item.subject, item.action));
  return {
    isReady: caller.isReady,
    items: caller.isReady ? items : [],
    isCatalogLoading: dataBacked.some((state) => state.isLoading),
    catalogFailure: dataBacked.find((state) => state.hasFailed),
  };
}

export function AppNameLink() {
  return (
    <Link
      to={APP_ROUTES.HOME}
      className="rounded-sm text-sm font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      {COPY.app.name}
    </Link>
  );
}

function SkeletonRows() {
  return (
    <div aria-busy="true" className="grid gap-1 px-3">
      <output className="sr-only">{COPY.access.nav.loading}</output>
      {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
        <div key={index} className="h-6 animate-pulse rounded bg-muted" />
      ))}
    </div>
  );
}

function ItemList({
  items,
  onNavigate,
}: MenuProps & { items: readonly FeatureNavItem[] }) {
  return (
    <ul className="grid gap-0.5">
      {items.map((item) => (
        <li key={item.path}>
          <NavLink
            to={item.path}
            onClick={onNavigate}
            className={({ isActive }) =>
              `${LINK_CLASS} ${isActive ? LINK_ACTIVE_CLASS : LINK_IDLE_CLASS}`
            }
          >
            {item.label}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

type SectionDefinition = (typeof NAV_SECTIONS)[number];

function MenuSection({
  section,
  menu,
  onNavigate,
}: MenuProps & { section: SectionDefinition; menu: MenuState }) {
  const leafIds = collectLeafIds([section]);
  const sectionItems = menu.items.filter((item) =>
    leafIds.includes(item.section),
  );
  const isDataBacked = section.id === DATA_BACKED_SECTION_ID;
  const hasFailed = isDataBacked && menu.catalogFailure !== undefined;
  const isLoading = isDataBacked && menu.isCatalogLoading && !hasFailed;
  if (sectionItems.length === 0 && !hasFailed && !isLoading) return null;

  const subSections = 'subSections' in section ? section.subSections : [];
  return (
    <section className="grid gap-1">
      <h2 className="px-3 text-xs font-medium text-muted-foreground">
        {section.label}
      </h2>
      {isLoading ? <SkeletonRows /> : null}
      {hasFailed ? (
        <div className="grid justify-items-start gap-1 px-3">
          <p className="text-sm text-destructive-strong">
            {COPY.access.nav.catalogError}
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => menu.catalogFailure?.retry()}
          >
            {COPY.access.nav.retryCatalog}
          </Button>
        </div>
      ) : null}
      {subSections.length === 0 ? (
        <ItemList items={sectionItems} onNavigate={onNavigate} />
      ) : (
        subSections.map((sub) => {
          const subItems = sectionItems.filter(
            (item) => item.section === sub.id,
          );
          if (subItems.length === 0) return null;
          return (
            <div key={sub.id} className="grid gap-0.5">
              <h3 className="px-3 pt-1 text-xs text-muted-foreground">
                {sub.label}
              </h3>
              <ItemList items={subItems} onNavigate={onNavigate} />
            </div>
          );
        })
      )}
    </section>
  );
}

function UserBlock({ onNavigate }: MenuProps) {
  const user = useCurrentUser();
  const session = useSession();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const isReviewer = user?.role === REVIEWER_ROLE_SLUG;

  return (
    <nav
      aria-label={COPY.session.mainNav}
      className="grid gap-2 border-t border-border px-4 py-3"
    >
      <p className="min-w-0 truncate text-sm text-muted-foreground">
        <span className="sr-only">{COPY.session.signedInAs} </span>
        <span className="text-foreground">{user?.displayName}</span>
      </p>
      {isReviewer ? null : (
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="justify-start px-3"
        >
          <Link to={APP_ROUTES.SECURITY_SETTINGS} onClick={onNavigate}>
            {COPY.session.securityLink}
          </Link>
        </Button>
      )}
      <Button
        size="sm"
        loading={isSigningOut}
        onClick={() => {
          setIsSigningOut(true);
          // The session ends either way; this component then unmounts.
          void session.signOut();
        }}
      >
        {COPY.session.signOut}
      </Button>
    </nav>
  );
}

/** Sections from `NAV_SECTIONS` filled with every feature's visible items, then the user block. */
export function SideMenu({ onNavigate }: MenuProps) {
  const menu = useMenuState();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        <nav aria-label={COPY.access.nav.label} className="grid gap-5">
          {menu.isReady ? (
            NAV_SECTIONS.map((section) => (
              <MenuSection
                key={section.id}
                section={section}
                menu={menu}
                onNavigate={onNavigate}
              />
            ))
          ) : (
            <SkeletonRows />
          )}
        </nav>
      </div>
      <UserBlock onNavigate={onNavigate} />
    </div>
  );
}
