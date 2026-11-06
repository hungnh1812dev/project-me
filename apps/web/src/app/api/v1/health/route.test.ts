import { describe, expect, it, vi } from 'vitest';

import { answerHealthRead } from '../../../../features/status/Health.server';

const defineBffRoute = vi.hoisted(() =>
  vi.fn<() => Record<string, unknown>>(() => ({ GET: vi.fn<() => void>() })),
);

vi.mock('../../../../apis/server/bff/BffRoute.server', () => ({ defineBffRoute }));

describe('/api/v1/health route', () => {
  it('exports GET wired to answerHealthRead with its route options', async () => {
    const route = await import('./route');

    expect(route.GET).toBeTypeOf('function');
    expect(defineBffRoute).toHaveBeenCalledWith({
      methods: ['GET'],
      bucket: 'read',
      handle: answerHealthRead,
    });
  });
});
