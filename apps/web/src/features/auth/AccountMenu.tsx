'use client';

import { Button } from '@abyss/form-commons';
import { useState } from 'react';

import { COPY } from '../../config/copy.constants';
import { appEnv } from '../../config/env.client';
import { useWebSession } from './useWebSession';
import { WebLoginDialog } from './WebLoginDialog';

/** Header controls: sign in, or the account name with Open CMS and sign out. */
export function AccountMenu() {
  const { status, user, signOut } = useWebSession();
  const [loginOpen, setLoginOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);

  // Reserves the space while the silent refresh runs, so nothing jumps.
  if (status === 'unknown') {
    return <div aria-hidden="true" className="h-8 w-20" />;
  }

  if (status === 'anonymous' || user === null) {
    return (
      <>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setLoginOpen(true)}
        >
          {COPY.session.signIn}
        </Button>
        <WebLoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
      </>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="hidden max-w-48 truncate text-sm text-muted-foreground sm:inline">
        {COPY.session.signedInAs(user.displayName)}
      </span>
      {appEnv.adminUrl !== undefined ? (
        <Button asChild size="sm" variant="secondary">
          <a href={appEnv.adminUrl}>{COPY.session.openCms}</a>
        </Button>
      ) : null}
      <Button
        size="sm"
        variant="ghost"
        loading={signingOut}
        onClick={() => {
          setSigningOut(true);
          setSignOutFailed(false);
          signOut()
            .catch(() => setSignOutFailed(true))
            .finally(() => setSigningOut(false));
        }}
      >
        {COPY.session.signOut}
      </Button>
      {signOutFailed ? (
        <p role="alert" className="text-sm text-destructive-strong">
          {COPY.session.signOutFailed}
        </p>
      ) : null}
    </div>
  );
}
