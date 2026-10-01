import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';

import UserMenu from './UserMenu';

/** Sticky header (AC-19): the "Toggle menu" button, a breadcrumb slot and the account menu. */
const AppHeader: React.FC = () => (
  <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-2 lg:px-4">
    <SidebarTrigger />
    <Separator orientation="vertical" className="mx-1 h-5 data-vertical:self-center" />
    {/* Breadcrumbs land here in small phase 3.5. */}
    <div className="min-w-0 flex-1" />
    <UserMenu />
  </header>
);
AppHeader.displayName = 'AppHeader';

export default AppHeader;
