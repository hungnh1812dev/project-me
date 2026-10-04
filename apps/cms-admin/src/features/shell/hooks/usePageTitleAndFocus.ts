import { useEffect, useRef, type RefObject } from 'react';
import { useLocation } from 'react-router-dom';

const APP_TITLE = 'CMS Admin';

/** "<page> · CMS Admin", or just "CMS Admin" when the page has no heading. */
export function formatPageTitle(heading: string | null | undefined): string {
  const page = heading?.trim();
  return page ? `${page} · ${APP_TITLE}` : APP_TITLE;
}

/**
 * Titles the document after the page `<h1>` inside `main`, following it while the page loads, and
 * after a client-side navigation (a new pathname) moves focus to that `<h1>`, or to `main` when
 * there is none (AC-16). The first load keeps focus where it is, so the skip link stays first.
 */
export function usePageTitleAndFocus(mainRef: RefObject<HTMLElement | null>): void {
  const { pathname } = useLocation();
  // The pathname focus was last handled for; null until the first page has rendered.
  const handledPathname = useRef<string | null>(null);

  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    const heading = () => main.querySelector('h1');
    const syncTitle = () => {
      document.title = formatPageTitle(heading()?.textContent);
    };
    syncTitle();

    // Compare pathnames rather than counting runs: StrictMode runs this effect twice on mount.
    if (handledPathname.current !== null && handledPathname.current !== pathname) {
      const target = heading() ?? main;
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus();
    }
    handledPathname.current = pathname;

    const observer = new MutationObserver(syncTitle);
    observer.observe(main, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      document.title = APP_TITLE;
    };
  }, [mainRef, pathname]);
}
