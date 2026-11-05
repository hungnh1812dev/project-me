import { describe, expect, it, vi } from 'vitest';

import { answerCvRead } from '../../../../features/cv/CvPage.server';

const defineBffRoute = vi.hoisted(() =>
  vi.fn<() => Record<string, unknown>>(() => ({ GET: vi.fn<() => void>() })),
);

vi.mock('../../../../apis/server/bff/BffRoute.server', () => ({ defineBffRoute }));

describe('/bff/v1/cv route', () => {
  it('exports GET wired to answerCvRead with its route options', async () => {
    const route = await import('./route');

    expect(route.GET).toBeTypeOf('function');
    expect(defineBffRoute).toHaveBeenCalledWith({
      methods: ['GET'],
      bucket: 'read',
      handle: answerCvRead,
    });
  });
});
