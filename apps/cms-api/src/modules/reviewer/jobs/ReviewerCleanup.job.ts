import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';

import { MS_PER_MINUTE } from '../../../common/constants/time.constants';
import { startIntervalJob } from '../../../infrastructure/scheduling/IntervalJob.adapter';
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

  constructor(private readonly cleanup: ReviewerCleanupService) {}

  onApplicationBootstrap(): void {
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
