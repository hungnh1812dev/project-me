'use client';

import { useState } from 'react';
import { Button } from '@abyss/form-commons';

import { appEnv } from '../../configs/Browser.env';
import { WebLoginDialog } from '../../features/auth';
import { useWebSession } from '../../features/session';
import { LAST_RESORT_TEXT, useRequiredSiteText, useSiteHeader } from '../../features/site-shell';
import { formatText } from '../../utils/TextTemplate.rules';

/** Header controls: sign in, or the account name with Open CMS and sign out. */
export function AccountMenu() {
  const { status, user, signOut } = useWebSession();
  const text = useRequiredSiteText();
  const author = useSiteHeader()?.author;
  const [loginOpen, setLoginOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);

  // Reserves the space while the silent refresh runs, so nothing jumps.
  if (status === 'unknown') {
    return <div aria-hidden="true" className="h-8 w-20" />;
  }

  if (status === 'anonymous' || user === null) {
    return (
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => setLoginOpen(true)}>
          {author?.btnLoginText ?? LAST_RESORT_TEXT.signIn}
        </Button>
        <WebLoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground hidden max-w-48 truncate text-sm sm:inline">
        {formatText(text.signedInAs, { name: user.displayName })}
      </span>
      {appEnv.adminUrl !== undefined ? (
        <Button asChild size="sm" variant="secondary">
          <a href={appEnv.adminUrl}>{text.openCms}</a>
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
        {author?.btnLogoutText ?? LAST_RESORT_TEXT.signOut}
      </Button>
      {signOutFailed ? (
        <p role="alert" className="text-destructive-strong text-sm">
          {text.signOutFailed}
        </p>
      ) : null}
    </div>
  );
}
