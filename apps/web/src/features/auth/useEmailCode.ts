'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import { isRateLimitError, webApiErrorOf } from '@/apis/client/ClientApi.errors';
import type { WebApiError } from '@/apis/WebApi.errors';
import { MAX_TIMER_DELAY_MS, MS_PER_SECOND } from '@/configs/Http.constants';

/**
 * Sends emailed 2FA codes: once as soon as `isReady` (the ref survives the
 * StrictMode effect replay, so still once), then on demand. After a 429 the
 * resend stays blocked for the server's Retry-After.
 */
export function useEmailCode(
  send: () => Promise<void>,
  onFailure?: (failure: WebApiError) => void,
  isReady = true,
) {
  const [sentCount, setSentCount] = useState(0);
  const [failure, setFailure] = useState<WebApiError | null>(null);
  const [isCoolingDown, setIsCoolingDown] = useState(false);
  const autoSent = useRef(false);
  const cooldownTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const mutation = useMutation({
    mutationFn: send,
    onMutate: () => setFailure(null),
    onSuccess: () => setSentCount((count) => count + 1),
    onError: (cause) => {
      const mapped = webApiErrorOf(cause);
      setFailure(mapped);
      onFailure?.(mapped);
      if (isRateLimitError(mapped) && mapped.retryAfterSeconds !== undefined) {
        setIsCoolingDown(true);
        clearTimeout(cooldownTimer.current);
        cooldownTimer.current = setTimeout(
          () => setIsCoolingDown(false),
          Math.min(mapped.retryAfterSeconds * MS_PER_SECOND, MAX_TIMER_DELAY_MS),
        );
      }
    },
  });
  const { mutate } = mutation;

  useEffect(() => {
    if (!isReady || autoSent.current) return;
    autoSent.current = true;
    mutate();
  }, [isReady, mutate]);

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
