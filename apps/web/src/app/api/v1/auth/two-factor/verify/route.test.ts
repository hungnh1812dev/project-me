import { describe, expect, it, vi } from 'vitest';

import { TURNSTILE } from '../../../../../../configs/Security.constants';
import {
  verifyBodySchema,
  verifyTwoFactorCode,
} from '../../../../../../features/session/SignIn.server';

const defineBffRoute = vi.hoisted(() =>
  vi.fn<() => Record<string, unknown>>(() => ({ POST: vi.fn<() => void>() })),
);

vi.mock('../../../../../../apis/server/bff/BffRoute.server', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  defineBffRoute,
}));

describe('/api/v1/auth/two-factor/verify route', () => {
  it('exports POST wired to verifyTwoFactorCode with its route options', async () => {
    const route = await import('./route');

    expect(route.POST).toBeTypeOf('function');
    expect(defineBffRoute).toHaveBeenCalledWith({
      methods: ['POST'],
      bucket: 'auth',
      bodySchema: verifyBodySchema,
      humanCheckAction: TURNSTILE.ACTIONS.TWO_FACTOR,
      handle: verifyTwoFactorCode,
    });
  });
});
