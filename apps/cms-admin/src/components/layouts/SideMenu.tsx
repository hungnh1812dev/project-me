import { useId } from 'react';
import { Button } from '@abyss/form-commons';
import { APP_ROUTES } from '@configs/App.routes';
import { COPY } from '@configs/Copy.constants';
import {
  collectLeafIds,
  DATA_BACKED_SECTION_ID,
  NAV_SECTIONS,
  type NavItem,
  type NavItemsState,
  type NavSource,
} from '@configs/NavSections.constants';
import { useCallerAccess } from '@features/access/useCallerAccess';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import { Link, NavLink } from 'react-router';

import { useNavGroupOpenState } from './useNavGroupOpenState';

const SKELETON_ROW_COUNT = 3;

const LINK_CLASS =
  'block break-words rounded-md border-l-2 px-3 py-1.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';
const LINK_ACTIVE_CLASS = 'border-primary bg-primary/10 font-medium text-foreground';
const LINK_IDLE_CLASS =
  'border-transparent text-muted-foreground hover:bg-accent hover:text-foreground';

interface MenuProps {
  /** Called after a link is chosen; the mobile sheet closes itself with it. */
  onNavigate?: (() => void) | undefined;
}

interface MenuState {
  isReady: boolean;
  items: readonly NavItem[];
  isCatalogLoading: boolean;
  catalogFailure: NavItemsState | undefined;
}

function useMenuState(nav: NavSource): MenuState {
  const caller = useCallerAccess();
  // The hook list is a module constant, so the call order never changes.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const dataBacked = nav.hooks.map((useNavItems) => useNavItems());
  const items = [...nav.items, ...dataBacked.flatMap((state) => state.items)].filter((item) =>
    caller.can(item.subject, item.action),
  );
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

function ItemList({ items, onNavigate }: MenuProps & { items: readonly NavItem[] }) {
  return (
    <ul className="grid gap-0.5">
      {items.map((item) => (
        <li key={item.path}>
          <NavLink
            to={item.path}
            title={item.label}
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
type OpenState = ReturnType<typeof useNavGroupOpenState>;

interface SubGroupProps extends MenuProps {
  sub: { id: string; label: string; icon: LucideIcon };
  items: readonly NavItem[];
  openState: OpenState;
}

function SubGroup({ sub, items, openState, onNavigate }: SubGroupProps) {
  const listId = useId();
  const isOpen = openState.isOpen(sub.id);
  const Icon = sub.icon;
  return (
    <div className="grid gap-0.5">
      <h3 className="text-xs text-muted-foreground">
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={listId}
          onClick={() => openState.toggle(sub.id)}
          className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Icon aria-hidden="true" className="size-4 shrink-0" />
          <span className="flex-1">{sub.label}</span>
          <ChevronDown
            aria-hidden="true"
            className={`size-4 shrink-0 transition-transform ${isOpen ? '' : '-rotate-90'}`}
          />
        </button>
      </h3>
      <div id={listId} hidden={!isOpen} className="ml-5 border-l border-border pl-1">
        <ItemList items={items} onNavigate={onNavigate} />
      </div>
    </div>
  );
}

function MenuSection({
  section,
  menu,
  openState,
  onNavigate,
}: MenuProps & {
  section: SectionDefinition;
  menu: MenuState;
  openState: OpenState;
}) {
  const leafIds = collectLeafIds([section]);
  const sectionItems = menu.items.filter((item) => leafIds.includes(item.section));
  const isDataBacked = section.id === DATA_BACKED_SECTION_ID;
  const hasFailed = isDataBacked && menu.catalogFailure !== undefined;
  const isLoading = isDataBacked && menu.isCatalogLoading && !hasFailed;
  if (sectionItems.length === 0 && !hasFailed && !isLoading) return null;

  const subSections = 'subSections' in section ? section.subSections : [];
  const Icon = section.icon;
  return (
    <section className="grid gap-1 border-t border-border pt-4 first:border-t-0 first:pt-0">
      <h2 className="flex items-center gap-2 px-3 text-xs font-medium text-muted-foreground">
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        {section.label}
      </h2>
      {isLoading ? <SkeletonRows /> : null}
      {hasFailed ? (
        <div className="grid justify-items-start gap-1 px-3">
          <p className="text-sm text-destructive-strong">{COPY.access.nav.catalogError}</p>
          <Button variant="ghost" size="sm" onClick={() => menu.catalogFailure?.retry()}>
            {COPY.access.nav.retryCatalog}
          </Button>
        </div>
      ) : null}
      {subSections.length === 0 ? (
        <ItemList items={sectionItems} onNavigate={onNavigate} />
      ) : (
        subSections.map((sub) => {
          const subItems = sectionItems.filter((item) => item.section === sub.id);
          if (subItems.length === 0) return null;
          return (
            <SubGroup
              key={sub.id}
              sub={sub}
              items={subItems}
              openState={openState}
              onNavigate={onNavigate}
            />
          );
        })
      )}
    </section>
  );
}

/** Sections from `NAV_SECTIONS` filled with the visible items of `nav`. */
export function SideMenu({ nav, onNavigate }: MenuProps & { nav: NavSource }) {
  const menu = useMenuState(nav);
  const openState = useNavGroupOpenState();
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
                openState={openState}
                onNavigate={onNavigate}
              />
            ))
          ) : (
            <SkeletonRows />
          )}
        </nav>
      </div>
    </div>
  );
}
