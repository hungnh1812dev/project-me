import { Logger } from '@nestjs/common';

import * as intervalJob from '../../../infrastructure/scheduling/IntervalJob.adapter';
import type { ReviewerCleanupService } from '../application/ReviewerCleanup.service';
import { ReviewerCleanupJob } from './ReviewerCleanup.job';

describe('ReviewerCleanupJob (ADR 0014)', () => {
  afterEach(() => jest.restoreAllMocks());

  function bootWith(isFeatureEnabled: boolean) {
    const stop = jest.fn();
    const start = jest
      .spyOn(intervalJob, 'startIntervalJob')
      .mockReturnValue(stop);
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const job = new ReviewerCleanupJob(
      {} as ReviewerCleanupService,
      isFeatureEnabled,
    );
    job.onApplicationBootstrap();
    return { job, start, stop, log };
  }

  it('starts the interval when the switch is on', () => {
    const { job, start, stop, log } = bootWith(true);

    expect(start).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalled();
    job.onModuleDestroy();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('starts nothing and logs one line when the switch is off', () => {
    const { job, start, log } = bootWith(false);

    expect(start).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      'Reviewer cleanup not started: REVIEWER_FEATURE_ENABLED is off',
    );
    expect(() => job.onModuleDestroy()).not.toThrow();
  });
});
