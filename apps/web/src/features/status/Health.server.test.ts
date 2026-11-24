import { answerHealthRead, answerUptimeCheck } from './Health.server';

const client = vi.hoisted(() => ({ readLiveHealth: vi.fn<() => Promise<boolean>>() }));
vi.mock('../../apis/server/restful/CmsApi.client', () => ({ cmsApiClient: client }));

describe('answerHealthRead', () => {
  it('answers 200 ok while cms-api is live', async () => {
    client.readLiveHealth.mockResolvedValue(true);

    const response = await answerHealthRead();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('answers 503 unavailable otherwise', async () => {
    client.readLiveHealth.mockResolvedValue(false);

    const response = await answerHealthRead();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unavailable' });
  });
});

describe('answerUptimeCheck', () => {
  it('answers 200 ok, uncached, without calling cms-api', async () => {
    client.readLiveHealth.mockClear();

    const response = answerUptimeCheck();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ status: 'ok' });
    expect(client.readLiveHealth).not.toHaveBeenCalled();
  });
});
