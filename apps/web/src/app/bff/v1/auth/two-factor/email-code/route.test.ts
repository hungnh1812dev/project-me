import { describe, expect, it, vi } from 'vitest';

import { TURNSTILE } from '../../../../../../configs/Security.constants';
import {
  emailCodeBodySchema,
  sendTwoFactorEmailCode,
} from '../../../../../../features/session/SignIn.server';

const defineBffRoute = vi.hoisted(() =>
  vi.fn<() => Record<string, unknown>>(() => ({ POST: vi.fn<() => void>() })),
);

vi.mock('../../../../../../apis/server/bff/BffRoute.server', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  defineBffRoute,
}));

describe('/bff/v1/auth/two-factor/email-code route', () => {
  it('exports POST wired to sendTwoFactorEmailCode with its route options', async () => {
    const route = await import('./route');

    expect(route.POST).toBeTypeOf('function');
    expect(defineBffRoute).toHaveBeenCalledWith({
      methods: ['POST'],
      bucket: 'auth',
      bodySchema: emailCodeBodySchema,
      humanCheckAction: TURNSTILE.ACTIONS.TWO_FACTOR,
      handle: sendTwoFactorEmailCode,
    });
  });
});
