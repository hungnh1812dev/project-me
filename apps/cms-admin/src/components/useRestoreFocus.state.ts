import { useRef, type RefObject } from 'react';

/**
 * Controlled dialogs have no Radix trigger, so Radix cannot give focus back.
 * Call `rememberOpener` when a dialog opens and pass `restoreFocus` to its
 * `onCloseAutoFocus`. When the opener is gone (its row was removed), focus
 * moves to the `h1` inside `headingContainer`, if one is given.
 */
export function useRestoreFocus(
  headingContainer?: RefObject<HTMLElement | null>,
) {
  const opener = useRef<HTMLElement | null>(null);

  const rememberOpener = (element: Element | null) => {
    opener.current = element instanceof HTMLElement ? element : null;
  };

  const restoreFocus = (event: Event) => {
    event.preventDefault();
    const target = opener.current;
    if (target?.isConnected) target.focus();
    else headingContainer?.current?.querySelector('h1')?.focus();
  };

  return { rememberOpener, restoreFocus };
}
