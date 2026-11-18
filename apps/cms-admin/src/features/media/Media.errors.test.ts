import { EN_TEXT } from '@configs/locales/en';
import { AxiosError } from 'axios';
import { describe, expect, it } from 'vitest';

import { toMediaError } from './Media.errors';

const TEXT = { media: EN_TEXT.media, access: EN_TEXT.access };

describe('toMediaError', () => {
  it('maps a timeout to the upload-took-too-long copy', () => {
    const result = toMediaError(new AxiosError('timeout', AxiosError.ECONNABORTED), TEXT);
    expect(result).toEqual({ kind: 'other', message: EN_TEXT.media.errors.timeout });
  });

  it('maps a user cancel to a canceled result with no message', () => {
    expect(toMediaError(new AxiosError('canceled', AxiosError.ERR_CANCELED), TEXT)).toEqual({
      kind: 'canceled',
      message: '',
    });
  });

  it('keeps the network copy for a response-less failure', () => {
    expect(toMediaError(new AxiosError('down', AxiosError.ERR_NETWORK), TEXT)).toEqual({
      kind: 'other',
      message: EN_TEXT.access.errors.network,
    });
  });
});
