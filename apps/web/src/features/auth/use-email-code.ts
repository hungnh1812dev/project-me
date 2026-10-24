'use client';

import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { MAX_TIMER_DELAY_MS, MS_PER_SECOND } from '../../config/http.constants';
import { type ApiFailure, apiFailureOf } from '../../lib/api-failure';

/**
 * Sends emailed 2FA codes: once on mount (the ref survives the StrictMode
 * effect replay, so still once), then on demand. After a 429 the resend stays
 * blocked for the server's Retry-After.
 */
export function useEmailCode(
  send: () => Promise<void>,
  onFailure?: (failure: ApiFailure) => void,
) {
  const [sentCount, setSentCount] = useState(0);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [isCoolingDown, setIsCoolingDown] = useState(false);
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
        setIsCoolingDown(true);
        clearTimeout(cooldownTimer.current);
        cooldownTimer.current = setTimeout(
          () => setIsCoolingDown(false),
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
    if (autoSent.current) return;
    autoSent.current = true;
    mutate();
  }, [mutate]);

  useEffect(() => () => clearTimeout(cooldownTimer.current), []);

  return {
    resend: () => mutate(),
    isSending: mutation.isPending,
    /** Successful sends so far (1 after the automatic one). */
    sentCount,
    failure,
    isCoolingDown,
  };
}
