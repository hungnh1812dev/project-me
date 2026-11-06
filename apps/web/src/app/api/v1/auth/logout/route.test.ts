import { describe, expect, it, vi } from 'vitest';

import { logOutVisitor } from '../../../../../features/session/SignIn.server';

const defineBffRoute = vi.hoisted(() =>
  vi.fn<() => Record<string, unknown>>(() => ({ POST: vi.fn<() => void>() })),
);

vi.mock('../../../../../apis/server/bff/BffRoute.server', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  defineBffRoute,
}));

describe('/api/v1/auth/logout route', () => {
  it('exports POST wired to logOutVisitor with its route options', async () => {
    const route = await import('./route');

    expect(route.POST).toBeTypeOf('function');
    expect(defineBffRoute).toHaveBeenCalledWith({
      methods: ['POST'],
      bucket: 'auth',
      handle: logOutVisitor,
    });
  });
});
