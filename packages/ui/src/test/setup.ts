import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom has no matchMedia or ResizeObserver; Base UI and the sidebar need them.
// Tests that need a specific media result spy on `window.matchMedia`.
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}

// jsdom has no layout, so Range has no client rects; CodeMirror measures text through them.
const emptyRect = (): DOMRect => new DOMRect(0, 0, 0, 0);
const emptyRectList = (): DOMRectList => {
  const list = [] as unknown as DOMRectList & DOMRect[];
  Object.defineProperty(list, 'item', { value: () => null });
  return list;
};
if (typeof Range !== 'undefined') {
  if (!Range.prototype.getClientRects) Range.prototype.getClientRects = emptyRectList;
  if (!Range.prototype.getBoundingClientRect) Range.prototype.getBoundingClientRect = emptyRect;
}
// CodeMirror calls `document.execCommand` on focus; jsdom doesn't implement it.
if (typeof document !== 'undefined' && !document.execCommand) document.execCommand = () => false;

afterEach(() => {
  cleanup();
});
