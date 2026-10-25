import { CheckReadinessService } from './CheckReadiness.service';
import type { DatabaseHealth } from './DatabaseHealth.port';
import { HEALTH_STATUS, READINESS_DB_TIMEOUT_MS } from './Health.constants';

describe('CheckReadinessService', () => {
  it('reports ok when the ping resolves, with the readiness timeout', async () => {
    const ping = jest.fn().mockResolvedValue(undefined);
    const service = new CheckReadinessService({ ping } as DatabaseHealth);

    await expect(service.check()).resolves.toEqual({
      status: HEALTH_STATUS.OK,
    });
    expect(ping).toHaveBeenCalledWith(READINESS_DB_TIMEOUT_MS);
  });

  it('reports error with the failure message when the ping rejects', async () => {
    const ping = jest.fn().mockRejectedValue(new Error('down'));
    const service = new CheckReadinessService({ ping } as DatabaseHealth);

    await expect(service.check()).resolves.toEqual({
      status: HEALTH_STATUS.ERROR,
      failureMessage: 'down',
    });
  });
});
