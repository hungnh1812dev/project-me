import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MAX_TIMER_DELAY_MS, MS_PER_SECOND } from '../../config/Http.constants';
import { useEmailCode } from './useEmailCode.mutation';

const HUGE_RETRY_AFTER_SECONDS = 10_000_000;

function rateLimitedWith(retryAfter: string) {
  return new AxiosError('limited', undefined, undefined, undefined, {
    status: 429,
    data: null,
    headers: { 'retry-after': retryAfter },
  } as unknown as AxiosResponse);
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useEmailCode cooldown', () => {
  afterEach(() => vi.useRealTimers());

  async function renderRateLimited(retryAfterSeconds: number) {
    const send = vi
      .fn<() => Promise<void>>()
      .mockRejectedValue(rateLimitedWith(String(retryAfterSeconds)));
    const hook = renderHook(() => useEmailCode(send), { wrapper });
    await waitFor(() => expect(hook.result.current.isCoolingDown).toBe(true));
    return hook;
  }

  it('keeps the resend blocked when Retry-After exceeds the timer limit', async () => {
    expect(HUGE_RETRY_AFTER_SECONDS * MS_PER_SECOND).toBeGreaterThan(
      MAX_TIMER_DELAY_MS,
    );
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
