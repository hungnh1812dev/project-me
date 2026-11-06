import { describe, expect, it, vi } from 'vitest';

import { TURNSTILE } from '../../../../../configs/Security.constants';
import { loginBodySchema, logInVisitor } from '../../../../../features/session/SignIn.server';

const defineBffRoute = vi.hoisted(() =>
  vi.fn<() => Record<string, unknown>>(() => ({
    GET: vi.fn<() => void>(),
    POST: vi.fn<() => void>(),
    PUT: vi.fn<() => void>(),
    PATCH: vi.fn<() => void>(),
    DELETE: vi.fn<() => void>(),
  })),
);

vi.mock('../../../../../apis/server/bff/BffRoute.server', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  defineBffRoute,
}));

describe('/api/v1/auth/login route', () => {
  it('exports POST wired to logInVisitor with its route options', async () => {
    const route = await import('./route');

    expect(route.POST).toBeTypeOf('function');
    // Every method is exported so the pipeline answers 405 with Allow, not Next's empty 405.
    for (const method of ['GET', 'PUT', 'PATCH', 'DELETE'] as const) {
      expect(route[method]).toBeTypeOf('function');
    }
    expect(defineBffRoute).toHaveBeenCalledWith({
      methods: ['POST'],
      bucket: 'auth',
      bodySchema: loginBodySchema,
      humanCheckAction: TURNSTILE.ACTIONS.LOGIN,
      handle: logInVisitor,
    });
  });
});
