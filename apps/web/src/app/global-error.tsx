'use client';

import { LAST_RESORT_TEXT } from '@/features/site-shell';

/**
 * Replaces the whole document when the root layout itself fails, so the shell
 * text cannot be loaded here: it shows the built-in last-resort text.
 */
export default function GlobalError({ retry }: { retry: () => void }) {
  return (
    <html lang="en">
      <body>
        <main role="alert" style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
          <h1>{LAST_RESORT_TEXT.errorTitle}</h1>
          <p>{LAST_RESORT_TEXT.errorDescription}</p>
          <button type="button" onClick={() => retry()}>
            {LAST_RESORT_TEXT.errorRetry}
          </button>
        </main>
      </body>
    </html>
  );
}
