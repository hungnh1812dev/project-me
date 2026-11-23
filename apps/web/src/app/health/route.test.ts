import { describe, expect, it } from 'vitest';

import { GET, HEAD } from './route';

describe('/health route', () => {
  it('answers GET with 200 ok', async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('answers HEAD with 200', () => {
    expect(HEAD().status).toBe(200);
  });

  it('exports no other method, so POST is a 405', async () => {
    const route: Record<string, unknown> = await import('./route');

    expect(route.POST).toBeUndefined();
  });
});
