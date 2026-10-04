import { useCallback, useEffect, useRef } from 'react';
import { useBlocker, type BlockerFunction } from 'react-router-dom';

/** What `UnsavedChangesDialog` needs, plus `bypass` for the navigation that follows a save. */
export interface UnsavedChangesGuard {
  /** A navigation is waiting for the user's answer. */
  open: boolean;
  /** Cancel: stay on the page and keep the edits. */
  stay: () => void;
  /** Discard: continue the blocked navigation. */
  leave: () => void;
  /** Lets every later navigation through, for example the redirect after a save or a delete. */
  bypass: () => void;
}

/**
 * The unsaved-changes guard (D10). While `dirty`, an in-app navigation to another page (a link,
 * Back) is blocked until the user answers the dialog, and `beforeunload` asks before the tab
 * closes or reloads. A clean form leaves without asking. Needs a data router (`useBlocker`).
 */
export function useUnsavedChangesGuard(dirty: boolean): UnsavedChangesGuard {
  const bypassed = useRef(false);

  const shouldBlock = useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation }) =>
      dirty && !bypassed.current && currentLocation.pathname !== nextLocation.pathname,
    [dirty],
  );
  const blocker = useBlocker(shouldBlock);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (bypassed.current) return;
      event.preventDefault();
      // Older browsers need a return value to show the prompt.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const stay = useCallback(() => {
    if (blocker.state === 'blocked') blocker.reset();
  }, [blocker]);
  const leave = useCallback(() => {
    if (blocker.state === 'blocked') blocker.proceed();
  }, [blocker]);
  const bypass = useCallback(() => {
    bypassed.current = true;
  }, []);

  return { open: blocker.state === 'blocked', stay, leave, bypass };
}
