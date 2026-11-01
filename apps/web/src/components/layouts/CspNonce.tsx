'use client';

import { setNonce } from 'get-nonce';

/**
 * Hands the request's CSP nonce to react-remove-scroll-bar (used by Radix
 * dialogs), which injects a <style> for the scroll lock and reads the nonce
 * through get-nonce. Without it the style is blocked by `style-src`.
 */
export function CspNonce({ nonce }: { nonce: string | null }) {
  if (nonce) setNonce(nonce);
  return null;
}
