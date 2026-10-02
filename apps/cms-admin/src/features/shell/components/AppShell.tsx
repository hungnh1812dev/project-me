import { useCallback, useRef, useState } from 'react';
import { Outlet } from 'react-router-dom';

import { Sidebar, SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';

import { usePageTitleAndFocus } from '../hooks/usePageTitleAndFocus';
import { readFlag, SIDEBAR_OPEN_KEY, writeFlag } from '../sidebarState';
import AppFooter from './AppFooter';
import AppHeader from './AppHeader';
import AppSidebar from './AppSidebar';
import SkipLink from './SkipLink';

/**
 * Layout route for the signed-in `/admin` pages (AC-14): skip link, side menu, header, the only
 * `<main>`, and the footer. It fills the dynamic viewport height, so mobile toolbars never hide
 * the header or the footer (AC-37). The desktop collapse state persists across reloads (AC-28).
 */
const AppShell: React.FC = () => {
  const mainRef = useRef<HTMLElement>(null);
  usePageTitleAndFocus(mainRef);
  const [open, setOpen] = useState(() => readFlag(SIDEBAR_OPEN_KEY, true));
  const onOpenChange = useCallback((next: boolean) => {
    writeFlag(SIDEBAR_OPEN_KEY, next);
    setOpen(next);
  }, []);

  return (
    <TooltipProvider>
      <SidebarProvider className="min-h-dvh" open={open} onOpenChange={onOpenChange}>
        <SkipLink />
        <Sidebar collapsible="icon">
          <AppSidebar />
        </Sidebar>
        <SidebarInset className="min-h-dvh min-w-0">
          <AppHeader />
          <main id="main-content" ref={mainRef} tabIndex={-1} className="flex-1 px-4 py-6 lg:px-6">
            <Outlet />
          </main>
          <AppFooter />
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
};
AppShell.displayName = 'AppShell';

export default AppShell;
