import { useCallback, useState } from 'react';

/**
 * The page-level success announcer (AC-10, D2). `announce(text)` puts `text` in the page's
 * `LiveRegion`. Announcing the same text twice toggles a trailing no-break space, so the region's
 * content changes and screen readers read it again.
 */
export function useAnnouncer() {
  const [message, setMessage] = useState('');
  const announce = useCallback(
    (text: string) => setMessage((previous) => (previous === text ? `${text} ` : text)),
    [],
  );
  return { message, announce };
}
