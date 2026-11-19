import { useEffect, useRef, useSyncExternalStore } from 'react';

import {
  attachTurnstileContainer,
  getServerTurnstileState,
  getTurnstileState,
  subscribeTurnstile,
} from './Turnstile.client';

export interface TurnstileSlotText {
  loading: string;
  failed: string;
  expired: string;
}

export interface TurnstileSlotProps {
  /** One of `HUMAN_CHECK_FORMS`; also the widget's `action`. */
  formId: string;
  text: TurnstileSlotText;
}

/**
 * Where the challenge renders. With `interaction-only` nothing shows unless
 * Cloudflare needs the visitor; the state text shows while the script loads,
 * after a failure and after the token expired.
 */
export function TurnstileSlot({ formId, text }: TurnstileSlotProps) {
  const container = useRef<HTMLDivElement>(null);
  const { status } = useSyncExternalStore(
    (listener) => subscribeTurnstile(formId, listener),
    () => getTurnstileState(formId),
    getServerTurnstileState,
  );

  useEffect(() => {
    if (container.current === null) return;
    return attachTurnstileContainer(formId, container.current);
  }, [formId]);

  return (
    <div className="grid gap-2">
      <div ref={container} />
      {status === 'loading' && (
        <output className="text-muted-foreground block text-sm">{text.loading}</output>
      )}
      {status === 'failed' && (
        <p role="alert" className="text-destructive-strong text-sm">
          {text.failed}
        </p>
      )}
      {status === 'expired' && (
        <p role="alert" className="text-destructive-strong text-sm">
          {text.expired}
        </p>
      )}
    </div>
  );
}
