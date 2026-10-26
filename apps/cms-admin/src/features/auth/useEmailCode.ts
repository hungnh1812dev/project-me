import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { MAX_TIMER_DELAY_MS, MS_PER_SECOND } from '../../config/Http.constants';
import { type ApiFailure, apiFailureOf } from '../../lib/ApiFailure.errors';

/**
 * Sends emailed 2FA codes: once on mount when `autoSend` (refs survive the
 * StrictMode effect replay, so still once), then on demand. After a 429 the
 * resend stays blocked for the server's Retry-After.
 */
export function useEmailCode(
  send: () => Promise<void>,
  autoSend: boolean,
  onFailure?: (failure: ApiFailure) => void,
) {
  const [sentCount, setSentCount] = useState(0);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [coolingDown, setCoolingDown] = useState(false);
  const autoSent = useRef(false);
  const cooldownTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const mutation = useMutation({
    mutationFn: send,
    onMutate: () => setFailure(null),
    onSuccess: () => setSentCount((count) => count + 1),
    onError: (cause) => {
      const mapped = apiFailureOf(cause);
      setFailure(mapped);
      onFailure?.(mapped);
      if (
        mapped.kind === 'rate-limited' &&
        mapped.retryAfterSeconds !== undefined
      ) {
        setCoolingDown(true);
        clearTimeout(cooldownTimer.current);
        cooldownTimer.current = setTimeout(
          () => setCoolingDown(false),
          Math.min(
            mapped.retryAfterSeconds * MS_PER_SECOND,
            MAX_TIMER_DELAY_MS,
          ),
        );
      }
    },
  });
  const { mutate } = mutation;

  useEffect(() => {
    if (!autoSend || autoSent.current) return;
    autoSent.current = true;
    mutate();
  }, [autoSend, mutate]);

  useEffect(() => () => clearTimeout(cooldownTimer.current), []);

  return {
    resend: () => mutate(),
    isSending: mutation.isPending,
    /** Successful sends so far (1 after the automatic one). */
    sentCount,
    failure,
    coolingDown,
  };
}
