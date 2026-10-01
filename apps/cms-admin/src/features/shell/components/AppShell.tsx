import { useRef } from 'react';
import { Outlet } from 'react-router-dom';

import { Sidebar, SidebarContent, SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

import { usePageTitleAndFocus } from '../hooks/usePageTitleAndFocus';
import AppFooter from './AppFooter';
import AppHeader from './AppHeader';
import SkipLink from './SkipLink';

/**
 * Layout route for the signed-in `/admin` pages (AC-14): skip link, side menu, header, the only
 * `<main>`, and the footer. It fills the dynamic viewport height, so mobile toolbars never hide
 * the header or the footer (AC-37).
 */
const AppShell: React.FC = () => {
  const mainRef = useRef<HTMLElement>(null);
  usePageTitleAndFocus(mainRef);

  return (
    <SidebarProvider className="min-h-dvh">
      <SkipLink />
      <Sidebar collapsible="icon">
        <SidebarContent>
          {/* The menu itself (AppSidebar) lands in small phase 3.4. */}
          <nav aria-label="Main" />
        </SidebarContent>
      </Sidebar>
      <SidebarInset className="min-h-dvh min-w-0">
        <AppHeader />
        <main id="main-content" ref={mainRef} tabIndex={-1} className="flex-1 px-4 py-6 lg:px-6">
          <Outlet />
        </main>
        <AppFooter />
      </SidebarInset>
    </SidebarProvider>
  );
};
AppShell.displayName = 'AppShell';

export default AppShell;
