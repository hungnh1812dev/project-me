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
    <div className="min-h-dvh bg-background md:flex md:h-dvh">
      <aside className="hidden w-64 shrink-0 flex-col bg-card shadow-card md:sticky md:top-0 md:flex md:h-dvh">
        <div className="px-4 py-4">
          <AppNameLink />
        </div>
        <SideMenu nav={nav} />
      </aside>
      <div className="min-w-0 flex-1 md:overflow-y-auto">
        <TopBar nav={nav} />
        {isReviewer ? <ReviewerBanner /> : null}
        <main className="mx-auto flex max-w-5xl flex-col gap-6 p-6 lg:gap-8 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
