'use client';

import * as React from 'react';

/** Below this width the side menu is an off-canvas Sheet (AC-35: mobile and tablet). */
const MOBILE_BREAKPOINT = 1024;
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

export function useIsMobile() {
  // Read the media query on the first render so the shell never flashes the desktop layout.
  const [isMobile, setIsMobile] = React.useState(() => window.matchMedia(QUERY).matches);

  React.useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const onChange = () => setIsMobile(mql.matches);
    mql.addEventListener('change', onChange);
    onChange();
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}
