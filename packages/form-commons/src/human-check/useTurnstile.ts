import { useEffect, useSyncExternalStore } from 'react';

import {
  getServerTurnstileState,
  getTurnstileState,
  registerTurnstileForm,
  resolveTurnstileSiteKey,
  subscribeTurnstile,
} from './Turnstile.client';

/**
 * The current Turnstile token of a form: `''` while none is ready or after it
 * expired. `siteKey` wins over the one set by `configureTurnstile`. The first
 * mount on a page loads Cloudflare's script; later forms reuse it.
 */
export function useTurnstile(formId: string, siteKey?: string): string {
  resolveTurnstileSiteKey(siteKey);
  useEffect(() => registerTurnstileForm(formId, siteKey), [formId, siteKey]);
  return useSyncExternalStore(
    (listener) => subscribeTurnstile(formId, listener),
    () => getTurnstileState(formId).token,
    () => getServerTurnstileState().token,
  );
}
