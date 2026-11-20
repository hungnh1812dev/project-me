import { act } from '@testing-library/react';
import { vi } from 'vitest';

import type { TurnstileApi } from '../src/human-check/Turnstile.client';

type RenderOptions = Parameters<TurnstileApi['render']>[1];

/** A fake `window.turnstile` that records every widget; `scripts()` lists the Turnstile script elements. */
export function installFakeTurnstile() {
  const widgets: { id: string; container: HTMLElement; options: RenderOptions }[] = [];
  const api = {
    render: vi.fn<TurnstileApi['render']>((container, options) => {
      const id = `widget-${widgets.length + 1}`;
      widgets.push({ id, container, options });
      return id;
    }),
    reset: vi.fn<TurnstileApi['reset']>(),
    remove: vi.fn<TurnstileApi['remove']>(),
  };
  window.turnstile = api;
  return { api, widgets };
}

export function turnstileScripts(): HTMLScriptElement[] {
  return [...document.querySelectorAll<HTMLScriptElement>('script')].filter((script) =>
    script.src.includes('challenges.cloudflare.com'),
  );
}

/** Simulates the script finishing its load: `window.turnstile` appears, then `load` fires. */
export function finishScriptLoad() {
  const fake = installFakeTurnstile();
  act(() => {
    turnstileScripts().forEach((script) => script.dispatchEvent(new Event('load')));
  });
  return fake;
}

/** Simulates the script event (`load` or `error`) on the Turnstile script element. */
export function fireScriptEvent(type: 'load' | 'error') {
  act(() => {
    turnstileScripts().forEach((script) => script.dispatchEvent(new Event(type)));
  });
}
