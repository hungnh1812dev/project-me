import type { NavSource } from '@configs/NavSections.constants';

import { MobileMenu } from './MobileMenu';
import { AppNameLink } from './SideMenu';
import { UserMenu } from './UserMenu';

/** Top bar on every width: app name and menu sheet below `md`, the user menu at the right. */
export function TopBar({ nav }: { nav: NavSource }) {
  return (
    <header className="flex min-h-14 items-center justify-between gap-3 border-b border-border bg-card px-4 py-2">
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
