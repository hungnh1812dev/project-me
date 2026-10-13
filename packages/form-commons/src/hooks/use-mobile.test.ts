import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useIsMobile } from './use-mobile';

const stubMatchMedia = (initial: boolean) => {
  const listeners = new Set<() => void>();
  const mql = {
    matches: initial,
    media: '',
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  };
  const spy = vi.spyOn(window, 'matchMedia').mockReturnValue(mql as unknown as MediaQueryList);
  const change = (matches: boolean) => {
    mql.matches = matches;
    listeners.forEach((listener) => listener());
  };
  return { spy, change, listeners };
};

describe('useIsMobile', () => {
  it('queries widths below the 1024px breakpoint', () => {
    const { spy } = stubMatchMedia(false);

    renderHook(() => useIsMobile());

    expect(spy).toHaveBeenCalledWith('(max-width: 1023px)');
  });

  it('reads the media query on the first render', () => {
    stubMatchMedia(true);

    const { result } = renderHook(() => useIsMobile());

    expect(result.current).toBe(true);
  });

  it('follows media query changes and stops listening on unmount', () => {
    const { change, listeners } = stubMatchMedia(false);
    const { result, unmount } = renderHook(() => useIsMobile());

    act(() => change(true));
    expect(result.current).toBe(true);

    unmount();
    expect(listeners.size).toBe(0);
  });
});
