import { COPY } from '@configs/Copy.constants';
import { AxiosError } from 'axios';
import { describe, expect, it } from 'vitest';

import { toMediaError } from './Media.errors';

describe('toMediaError', () => {
  it('maps a timeout to the upload-took-too-long copy', () => {
    const result = toMediaError(new AxiosError('timeout', AxiosError.ECONNABORTED));
    expect(result).toEqual({ kind: 'other', message: COPY.media.errors.timeout });
  });

  it('maps a user cancel to a canceled result with no message', () => {
    expect(toMediaError(new AxiosError('canceled', AxiosError.ERR_CANCELED))).toEqual({
      kind: 'canceled',
      message: '',
    });
  });

  it('keeps the network copy for a response-less failure', () => {
    expect(toMediaError(new AxiosError('down', AxiosError.ERR_NETWORK))).toEqual({
      kind: 'other',
      message: COPY.access.errors.network,
    });
  });
});
