'use client';

import { Button } from '@abyss/form-commons';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { COPY } from '../config/copy.constants';
import { appEnv } from '../config/env.client';
import { REVIEWER_STATUS_STALE_MS } from '../config/reviewer.constants';
import { apiClient } from '../lib/api-client';
import { WebLoginDialog } from '../features/auth';
import { createReviewerApi, ReviewerAccessDialog } from '../features/reviewer';
import { useWebSession } from '../features/session';

const reviewerApi = createReviewerApi(apiClient);

/** Header controls: sign in, or the account name with Open CMS and sign out. */
export function AccountMenu() {
  const { status, user, kind, signOut } = useWebSession();
  const [loginOpen, setLoginOpen] = useState(false);
  const [reviewerOpen, setReviewerOpen] = useState(false);
  const siteKey = appEnv.turnstileSiteKey;
  // Only an anonymous visitor can ask for reviewer access, and only when the
  // owner switched it on and the widget is configured.
  const reviewerEnabled = useQuery({
    queryKey: ['reviewer', 'status'],
    queryFn: reviewerApi.isEnabled,
    enabled: siteKey !== undefined && status === 'anonymous',
    staleTime: REVIEWER_STATUS_STALE_MS,
    retry: false,
  });
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
        {siteKey !== undefined && reviewerEnabled.data === true ? (
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
