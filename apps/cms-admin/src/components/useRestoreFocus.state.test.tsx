import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useRestoreFocus } from './useRestoreFocus.state';

afterEach(() => {
  document.body.replaceChildren();
});

function closeEvent() {
  return new Event('focusout', { cancelable: true });
}

describe('useRestoreFocus', () => {
  it('focuses the remembered opener and cancels Radix focus handling', () => {
    const button = document.body.appendChild(document.createElement('button'));
    const { result } = renderHook(() => useRestoreFocus());
    result.current.rememberOpener(button);
    const event = closeEvent();
    result.current.restoreFocus(event);
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(button);
  });

  it('falls back to the heading when the opener left the page', () => {
    const container = document.body.appendChild(document.createElement('div'));
    const heading = container.appendChild(document.createElement('h1'));
    heading.tabIndex = -1;
    const gone = document.createElement('button');
    const { result } = renderHook(() =>
      useRestoreFocus({ current: container }),
    );
    result.current.rememberOpener(gone);
    result.current.restoreFocus(closeEvent());
    expect(document.activeElement).toBe(heading);
  });

  it('does nothing without an opener or a heading container', () => {
    const { result } = renderHook(() => useRestoreFocus());
    result.current.restoreFocus(closeEvent());
    expect(document.activeElement).toBe(document.body);
  });
});
