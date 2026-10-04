import { Separator } from '@repo/ui/components/separator';
import { SidebarTrigger } from '@repo/ui/components/sidebar';

import Breadcrumbs from './Breadcrumbs';
import UserMenu from './UserMenu';

/** Sticky header (AC-19): the "Toggle menu" button, the breadcrumbs and the account menu. */
const AppHeader: React.FC = () => (
  <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-2 lg:px-4">
    <SidebarTrigger />
    <Separator orientation="vertical" className="mx-1 h-5 data-vertical:self-center" />
    <div className="min-w-0 flex-1">
      <Breadcrumbs />
    </div>
    <UserMenu />
  </header>
);
AppHeader.displayName = 'AppHeader';

export default AppHeader;
