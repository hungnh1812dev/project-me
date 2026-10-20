import { Button } from '@abyss/form-commons';
import { useState } from 'react';
import { Link, Outlet } from 'react-router';

import { COPY } from '../config/copy.constants';
import { APP_ROUTES } from '../config/routes';
import { selectCurrentUser } from '../features/auth/auth.slice';
import { useSession } from '../features/auth/session-context';
import { useAppSelector } from './store';

/** Layout of every signed-in page: header with the user and sign-out. */
export function AppShell() {
  const user = useAppSelector(selectCurrentUser);
  const session = useSession();
  const [signingOut, setSigningOut] = useState(false);

  return (
    <div className="min-h-dvh">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link
            to={APP_ROUTES.HOME}
            className="rounded-sm text-sm font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {COPY.app.name}
          </Link>
          <nav
            aria-label={COPY.session.mainNav}
            className="flex min-w-0 items-center gap-3"
          >
            <p className="min-w-0 truncate text-sm text-muted-foreground">
              <span className="sr-only">{COPY.session.signedInAs} </span>
              <span className="text-foreground">{user?.displayName}</span>
            </p>
            <Button asChild variant="ghost" size="sm">
              <Link to={APP_ROUTES.SECURITY_SETTINGS}>
                {COPY.session.securityLink}
              </Link>
            </Button>
            <Button
              size="sm"
              loading={signingOut}
              onClick={() => {
                setSigningOut(true);
                // The session ends either way; this component then unmounts.
                void session.signOut();
              }}
            >
              {COPY.session.signOut}
            </Button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <Outlet />
      </main>
    </div>
  );
}
