'use client';

import { useRef, useState } from 'react';
import { Button } from '@abyss/form-commons';

import { appEnv } from '@/configs/Browser.env';
import { LAST_RESORT_TEXT } from '@/configs/LastResort.constants';
import { WebLoginDialog, type SignInText } from '@/features/auth';
import { useWebSession } from '@/features/session';
import type { HeaderContent, HeaderText } from '@/features/site-header/SiteHeader.graphql';
import { formatText } from '@/utils/TextTemplate.rules';

interface AccountMenuProps {
  text: HeaderText;
  author: HeaderContent['author'];
  /** Without it the sign-in text did not load: no sign-in button and no dialog. */
  signInText: SignInText | null;
}

/** Header controls: sign in, or the account name with Open CMS and sign out. */
export function AccountMenu({ text, author, signInText }: AccountMenuProps) {
  const { status, user, signOut } = useWebSession();
  const signInButtonRef = useRef<HTMLButtonElement>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);

  // Reserves the space while the silent refresh runs, so nothing jumps.
  if (status === 'unknown') {
    return <div aria-hidden="true" className="h-8 w-20" />;
  }

  if (status === 'anonymous' || user === null) {
    if (signInText === null) return null;
    return (
      <div className="flex items-center gap-2">
        <Button
          ref={signInButtonRef}
          size="sm"
          variant="secondary"
          onClick={() => setLoginOpen(true)}
        >
          {author?.btnLoginText ?? LAST_RESORT_TEXT.signIn}
        </Button>
        <WebLoginDialog
          open={loginOpen}
          onOpenChange={setLoginOpen}
          returnFocusRef={signInButtonRef}
          text={signInText}
        />
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
