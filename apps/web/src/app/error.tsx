'use client';

import { Button } from '@abyss/form-commons';

import { LAST_RESORT_TEXT, useSiteText } from '@/features/site-shell';

/**
 * Shown when a page fails to load. It never reads the thrown error, so no
 * server detail and no data of another visitor can reach the screen.
 */
export default function ErrorPage({ retry }: { retry: () => void }) {
  const text = useSiteText() ?? LAST_RESORT_TEXT;
  return (
    <div role="alert">
      <h1 className="text-2xl font-semibold tracking-tight">{text.errorTitle}</h1>
      <p className="text-muted-foreground mt-2 max-w-prose text-sm">{text.errorDescription}</p>
      <div className="mt-6">
        <Button variant="primary" onClick={() => retry()}>
          {text.errorRetry}
        </Button>
      </div>
    </div>
  );
}
