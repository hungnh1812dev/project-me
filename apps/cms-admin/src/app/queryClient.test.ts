import { describe, expect, it } from 'vitest';

import { ApiError } from '@/core/api/apiError';

import { makeQueryClient, queryClient, shouldRetryQuery } from './queryClient';

const apiError = (status: number) => new ApiError({ status, message: `status ${status}` });

describe('shouldRetryQuery', () => {
  it.each([400, 401, 403, 404, 409, 422, 429, 499])('never retries a %i ApiError', (status) => {
    expect(shouldRetryQuery(0, apiError(status))).toBe(false);
  });

  it.each([0, 500, 503])('retries a %i ApiError once', (status) => {
    expect(shouldRetryQuery(0, apiError(status))).toBe(true);
    expect(shouldRetryQuery(1, apiError(status))).toBe(false);
  });

  it('retries a non-ApiError once', () => {
    expect(shouldRetryQuery(0, new Error('boom'))).toBe(true);
    expect(shouldRetryQuery(1, new Error('boom'))).toBe(false);
  });
});

describe('makeQueryClient', () => {
  it('sets the shared query and mutation defaults', () => {
    const { queries, mutations } = makeQueryClient().getDefaultOptions();

    expect(queries).toMatchObject({
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: shouldRetryQuery,
    });
    expect(mutations).toMatchObject({ retry: false });
  });

  it('returns a fresh client each time, separate from the shared one', () => {
    expect(makeQueryClient()).not.toBe(makeQueryClient());
    expect(makeQueryClient()).not.toBe(queryClient);
  });
});
