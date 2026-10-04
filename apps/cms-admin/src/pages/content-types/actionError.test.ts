import { describe, expect, it } from 'vitest';

import { ApiError } from '@/core/api/apiError';

import { actionErrorText, NO_ACCESS } from './actionError';

const apiError = (status: number, message: string) =>
  new ApiError({ status, code: 'ERR', message, messages: [message] });

describe('actionErrorText', () => {
  it('says "no access" for a 403', () => {
    expect(actionErrorText(apiError(403, 'Forbidden resource'))).toBe(NO_ACCESS);
  });

  it('shows the message of any other error', () => {
    expect(actionErrorText(apiError(400, 'Draft and publish is off'))).toBe(
      'Draft and publish is off',
    );
    expect(actionErrorText(new Error('Network down'))).toBe('Network down');
  });

  it('falls back to "no access" for a value that is not an error', () => {
    expect(actionErrorText('boom')).toBe(NO_ACCESS);
  });
});
