import type { Request, Response } from 'express';

import { securityHeadersMiddleware } from './SecurityHeaders.middleware';

describe('securityHeadersMiddleware', () => {
  it('sets exactly the pinned header set and calls next', () => {
    const headers: Record<string, string> = {};
    const res = {
      setHeader: (name: string, value: string) => {
        headers[name] = value;
      },
    } as unknown as Response;
    const next = jest.fn();

    securityHeadersMiddleware({} as Request, res, next);

    expect(headers).toEqual({
      'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
      'strict-transport-security': 'max-age=63072000; includeSubDomains',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
    });
    expect(next).toHaveBeenCalledTimes(1);
  });
});
