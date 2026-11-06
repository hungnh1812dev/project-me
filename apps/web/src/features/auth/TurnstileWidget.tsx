'use client';

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';

import './Turnstile.client';

import { COPY } from '@/configs/Copy.constants';
import { TURNSTILE, type TurnstileAction } from '@/configs/Security.constants';

const copy = COPY.login.humanCheck;

/**
 * Cloudflare Turnstile. The script loads only while this component is
 * mounted (inside the sign-in dialog), so no other page contacts Cloudflare.
 * Mount it with a new `key` to get a fresh challenge (a token works once).
 */
export function TurnstileWidget({
  siteKey,
  action,
  hasScriptFailed,
  onFailed,
  onToken,
  onExpired,
}: {
  siteKey: string;
  /** The BFF checks that the token was issued for the step it protects. */
  action: TurnstileAction;
  /** Held by the parent so it survives a remount (Back and Next). */
  hasScriptFailed: boolean;
  onFailed: () => void;
  onToken: (token: string) => void;
  onExpired: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const [ready, setReady] = useState(
    () => typeof window !== 'undefined' && window.turnstile !== undefined,
  );
  // Latest callbacks without re-rendering the widget.
  const callbacks = useRef({ onToken, onExpired, onFailed });
  useEffect(() => {
    callbacks.current = { onToken, onExpired, onFailed };
  });

  useEffect(() => {
    const api = window.turnstile;
    if (!ready || api === undefined || container.current === null) return;
    widgetId.current = api.render(container.current, {
      sitekey: siteKey,
      action,
      callback: (token) => callbacks.current.onToken(token),
      'expired-callback': () => callbacks.current.onExpired(),
      'error-callback': () => callbacks.current.onFailed(),
    });
    return () => {
      if (widgetId.current !== null) api.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [ready, siteKey, action]);

  return (
    <div className="grid gap-2">
      <Script
        src={TURNSTILE.SCRIPT_URL}
        strategy="afterInteractive"
        onReady={() => setReady(true)}
        onError={onFailed}
      />
      <div ref={container} className="min-h-16" />
      {hasScriptFailed ? (
        <p role="alert" className="text-destructive-strong text-sm">
          {copy.failed}
        </p>
      ) : !ready ? (
        <output className="text-muted-foreground block text-sm">{copy.loading}</output>
      ) : null}
    </div>
  );
}
