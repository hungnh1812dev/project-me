import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { API_ERROR_CODES, API_ERROR_SOURCES, WebApiError } from '@/apis/WebApi.errors';

import { MAX_TIMER_DELAY_MS, MS_PER_SECOND } from '../../configs/Http.constants';
import { useEmailCode } from './useEmailCode';

const HUGE_RETRY_AFTER_SECONDS = 10_000_000;

function rateLimitedWith(retryAfterSeconds: number) {
  return new WebApiError({
    source: API_ERROR_SOURCES.BFF,
    errorCode: API_ERROR_CODES.CLIENT.RATE_LIMITED,
    statusCode: 429,
    retryAfterSeconds,
  });
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useEmailCode cooldown', () => {
  afterEach(() => vi.useRealTimers());

  async function renderRateLimited(retryAfterSeconds: number) {
    const send = vi.fn<() => Promise<void>>().mockRejectedValue(rateLimitedWith(retryAfterSeconds));
    const hook = renderHook(() => useEmailCode(send), { wrapper });
    await waitFor(() => expect(hook.result.current.isCoolingDown).toBe(true));
    return hook;
  }

  it('keeps the resend blocked when Retry-After exceeds the timer limit', async () => {
    expect(HUGE_RETRY_AFTER_SECONDS * MS_PER_SECOND).toBeGreaterThan(MAX_TIMER_DELAY_MS);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = await renderRateLimited(HUGE_RETRY_AFTER_SECONDS);
    await act(() => vi.advanceTimersByTimeAsync(MS_PER_SECOND));
    expect(result.current.isCoolingDown).toBe(true);
  });

  it('releases the resend after a normal Retry-After', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = await renderRateLimited(2);
    await act(() => vi.advanceTimersByTimeAsync(2 * MS_PER_SECOND));
    expect(result.current.isCoolingDown).toBe(false);
  });
});
