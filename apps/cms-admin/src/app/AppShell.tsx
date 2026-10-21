import { Button } from '@abyss/form-commons';
import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router';

import { COPY } from '../config/copy.constants';
import { APP_ROUTES } from '../config/routes';
import { useCallerAccess } from '../features/access/caller-access';
import { selectCurrentUser } from '../features/auth/auth.slice';
import { useSession } from '../features/auth/session-context';
import { useAppSelector } from './store';

/** Layout of every signed-in page: header with the user and sign-out. */
export function AppShell() {
  const user = useAppSelector(selectCurrentUser);
  const session = useSession();
  const [signingOut, setSigningOut] = useState(false);
  const caller = useCallerAccess();
  const showAccounts = caller.ready && caller.can('accounts', 'read');
  const showRoles = caller.ready && caller.can('roles', 'read');
  const showTokens = caller.ready && caller.can('api_tokens', 'read');
  const showMedia = caller.ready && caller.can('media', 'read');

  return (
    <div className="min-h-dvh">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex min-h-14 max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2 sm:px-6">
          <Link
            to={APP_ROUTES.HOME}
            className="rounded-sm text-sm font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {COPY.app.name}
          </Link>
          {showAccounts || showRoles || showTokens || showMedia ? (
            <nav
              aria-label={COPY.access.nav.label}
              className="order-last flex basis-full items-center gap-1 sm:order-none sm:min-w-0 sm:flex-1 sm:basis-auto"
            >
              {showAccounts ? (
                <Button asChild variant="ghost" size="sm">
                  <NavLink to={APP_ROUTES.ACCOUNTS}>
                    {COPY.access.nav.accounts}
                  </NavLink>
                </Button>
              ) : null}
              {showRoles ? (
                <Button asChild variant="ghost" size="sm">
                  <NavLink to={APP_ROUTES.ROLES}>
                    {COPY.access.nav.roles}
                  </NavLink>
                </Button>
              ) : null}
              {showTokens ? (
                <Button asChild variant="ghost" size="sm">
                  <NavLink to={APP_ROUTES.API_TOKENS}>
                    {COPY.access.nav.apiTokens}
                  </NavLink>
                </Button>
              ) : null}
              {showMedia ? (
                <Button asChild variant="ghost" size="sm">
                  <NavLink to={APP_ROUTES.MEDIA}>
                    {COPY.access.nav.media}
                  </NavLink>
                </Button>
              ) : null}
            </nav>
          ) : null}
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
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <Outlet />
      </main>
    </div>
  );
}
