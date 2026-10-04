import { describe, expect, it } from 'vitest';

import { ApiError } from '@/core/api/apiError';

import { guard } from './guard';
import type { Decision } from './policies';

const ALLOW: Decision = { allowed: true, reason: null };

describe('guard', () => {
  it('returns when the decision is allowed', () => {
    expect(() => guard(ALLOW)).not.toThrow();
  });

  it('throws ApiError 403 ERR_CLIENT_FORBIDDEN with the reason when denied', () => {
    let thrown: unknown;
    try {
      guard({ allowed: false, reason: 'Requires the "role:manager" permission.' });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ApiError);
    expect(thrown).toMatchObject({
      status: 403,
      code: 'ERR_CLIENT_FORBIDDEN',
      message: 'Requires the "role:manager" permission.',
      messages: ['Requires the "role:manager" permission.'],
    });
  });

  it('falls back to a generic message when a denial has no reason', () => {
    expect(() => guard({ allowed: false, reason: null })).toThrow(
      expect.objectContaining({ status: 403, code: 'ERR_CLIENT_FORBIDDEN', message: 'Forbidden.' }),
    );
  });
});
