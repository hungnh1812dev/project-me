'use client';

import { Button } from '@abyss/form-commons';
import { useState } from 'react';

import { COPY } from '../config/Copy.constants';
import { appEnv } from '../config/Browser.env';
import { WebLoginDialog } from '../features/auth';
import { ReviewerAccessDialog, useReviewerEnabled } from '../features/reviewer';
import { useWebSession } from '../features/session';

/** Header controls: sign in, or the account name with Open CMS and sign out. */
export function AccountMenu() {
  const { status, user, kind, signOut } = useWebSession();
  const [loginOpen, setLoginOpen] = useState(false);
  const [reviewerOpen, setReviewerOpen] = useState(false);
  const siteKey = appEnv.turnstileSiteKey;
  const isReviewerEnabled = useReviewerEnabled();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);

  // Reserves the space while the silent refresh runs, so nothing jumps.
  if (status === 'unknown') {
    return <div aria-hidden="true" className="h-8 w-20" />;
  }

  if (status === 'anonymous' || user === null) {
    return (
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setLoginOpen(true)}
        >
          {COPY.session.signIn}
        </Button>
        {siteKey !== undefined && isReviewerEnabled ? (
          <>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setReviewerOpen(true)}
            >
              {COPY.reviewer.open}
            </Button>
            <ReviewerAccessDialog
              open={reviewerOpen}
              onOpenChange={setReviewerOpen}
              siteKey={siteKey}
            />
          </>
        ) : null}
        <WebLoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
      </div>
    );
  }

  const reviewing = kind === 'reviewer';

  return (
    <div className="flex items-center gap-2">
      <span className="hidden max-w-48 truncate text-sm text-muted-foreground sm:inline">
        {reviewing
          ? COPY.session.reviewing
          : COPY.session.signedInAs(user.displayName)}
      </span>
      {appEnv.adminUrl !== undefined && !reviewing ? (
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
        {reviewing ? COPY.session.endReview : COPY.session.signOut}
      </Button>
      {signOutFailed ? (
        <p role="alert" className="text-sm text-destructive-strong">
          {COPY.session.signOutFailed}
        </p>
      ) : null}
    </div>
  );
}
