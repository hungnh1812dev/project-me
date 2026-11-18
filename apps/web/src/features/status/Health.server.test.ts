import { answerHealthRead } from './Health.server';

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
