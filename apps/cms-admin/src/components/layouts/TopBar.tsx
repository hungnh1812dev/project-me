import type { NavSource } from '@configs/NavSections.constants';

import { MobileMenu } from './MobileMenu';
import { AppNameLink } from './SideMenu';
import { UserMenu } from './UserMenu';

/** Sticky top bar on every width: app name and menu sheet below `md`, the user menu at the right. */
export function TopBar({ nav }: { nav: NavSource }) {
  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-3 bg-card/90 px-4 shadow-card backdrop-blur-md">
      <div className="flex items-center gap-3 md:hidden">
        <AppNameLink />
        <MobileMenu nav={nav} />
      </div>
      <div className="ml-auto">
        <UserMenu />
      </div>
    </header>
  );
}
