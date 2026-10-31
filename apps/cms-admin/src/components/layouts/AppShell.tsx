import { REVIEWER_ROLE_SLUG } from '@configs/Auth.constants';
import type { NavSource } from '@configs/NavSections.constants';
import { useCurrentUser } from '@features/auth';
import { ReviewerBanner } from '@features/reviewer/ReviewerBanner';
import { Outlet } from 'react-router';

import { AppNameLink, SideMenu } from './SideMenu';
import { TopBar } from './TopBar';

/** Layout of every signed-in page: side menu from `md` up, top bar with the user menu on every width. */
export function AppShell({ nav }: { nav: NavSource }) {
  const isReviewer = useCurrentUser()?.role === REVIEWER_ROLE_SLUG;

  return (
    <div className="min-h-dvh md:flex md:h-dvh">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="px-4 py-4">
          <AppNameLink />
        </div>
        <SideMenu nav={nav} />
      </aside>
      <div className="min-w-0 flex-1 md:overflow-y-auto">
        <TopBar nav={nav} />
        {isReviewer ? <ReviewerBanner /> : null}
        <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
