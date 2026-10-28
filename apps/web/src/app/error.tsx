'use client';

import { Button } from '@abyss/form-commons';

import { COPY } from '../config/Copy.constants';

/**
 * Shown when a page fails to load. It never reads the thrown error, so no
 * server detail and no data of another visitor can reach the screen.
 */
export default function ErrorPage({ retry }: { retry: () => void }) {
  return (
    <div role="alert">
      <h1 className="text-2xl font-semibold tracking-tight">
        {COPY.error.title}
      </h1>
      <p className="mt-2 max-w-prose text-sm text-muted-foreground">
        {COPY.error.description}
      </p>
      <div className="mt-6">
        <Button variant="primary" onClick={() => retry()}>
          {COPY.error.retry}
        </Button>
      </div>
    </div>
  );
}
