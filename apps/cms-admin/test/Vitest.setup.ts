import '@testing-library/jest-dom/vitest';

import { cleanup, configure } from '@testing-library/react';
import { afterEach, beforeAll } from 'vitest';

import { preloadScreenText, type ScreenName } from '../src/configs/locales';

// jsdom has <dialog> but not its modal API: open/close via the attribute.
// Tests cannot check focus trapping or inertness; the browser e2e covers them.
if (typeof HTMLDialogElement.prototype.showModal !== 'function') {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
}

// jsdom has no ResizeObserver; Radix (checkbox in a form) measures with it.
if (typeof globalThis.ResizeObserver !== 'function') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// The 1000 ms default for findBy / waitFor is too short when the monorepo's tests run in parallel.
const ASYNC_UTIL_TIMEOUT_MS = 5000;
configure({ asyncUtilTimeout: ASYNC_UTIL_TIMEOUT_MS });

// Every screen's text is loaded before a test renders, so components never suspend on it.
const ALL_SCREENS: readonly ScreenName[] = [
  'access',
  'backups',
  'content',
  'login',
  'media',
  'reviewer',
  'schemaBuilder',
  'security',
  'setup',
  'status',
];
beforeAll(async () => {
  await preloadScreenText(ALL_SCREENS);
});

afterEach(() => {
  cleanup();
});
