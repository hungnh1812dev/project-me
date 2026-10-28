import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';

import { MS_PER_MINUTE } from '../../../common/constants/Time.constants';
import { startIntervalJob } from '../../../infrastructure/scheduling/IntervalJob.adapter';
import { IS_REVIEWER_FEATURE_ENABLED } from '../application/Reviewer.port';
import { ReviewerCleanupService } from '../application/ReviewerCleanup.service';

/** Sweep of expired reviewer accounts (in-process, like the media purge). */
const REVIEWER_CLEANUP_INTERVAL_MS = 10 * MS_PER_MINUTE;

/**
 * Runs `ReviewerCleanupService` on an interval. With several replicas every
 * one runs it, which is harmless.
 */
@Injectable()
export class ReviewerCleanupJob
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(ReviewerCleanupJob.name);
  private stop: (() => void) | undefined;

  constructor(
    private readonly cleanup: ReviewerCleanupService,
    @Inject(IS_REVIEWER_FEATURE_ENABLED)
    private readonly isFeatureEnabled: boolean,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.isFeatureEnabled) {
      this.logger.log(
        'Reviewer cleanup not started: REVIEWER_FEATURE_ENABLED is off',
      );
      return;
    }
    this.stop = startIntervalJob({
      intervalMs: REVIEWER_CLEANUP_INTERVAL_MS,
      run: () => this.run(),
      onError: (error) =>
        this.logger.error(
          `Reviewer cleanup failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        ),
    });
  }

  onModuleDestroy(): void {
    this.stop?.();
  }

  /** Returns how many accounts were deleted. */
  run(): Promise<number> {
    return this.cleanup.run();
  }
}
