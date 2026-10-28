import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';

import { MS_PER_HOUR } from '../../../common/constants/Time.constants';
import { startIntervalJob } from '../../../infrastructure/scheduling/IntervalJob.adapter';
import {
  PurgeDeletedMediaService,
  type PurgeResult,
} from '../application/PurgeDeletedMedia.service';

/** The purge runs this often, in-process (one replica; see README). */
const MEDIA_PURGE_INTERVAL_MS = MS_PER_HOUR;

/**
 * Runs `PurgeDeletedMediaService` on an interval. With several replicas
 * every one runs it, which is harmless (deleting a missing object is not an
 * error).
 */
@Injectable()
export class MediaPurgeJob implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(MediaPurgeJob.name);
  private stop: (() => void) | undefined;

  constructor(private readonly purge: PurgeDeletedMediaService) {}

  onApplicationBootstrap(): void {
    this.stop = startIntervalJob({
      intervalMs: MEDIA_PURGE_INTERVAL_MS,
      run: () => this.run(),
      onError: (error) =>
        this.logger.error(
          `Media purge failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        ),
    });
  }

  onModuleDestroy(): void {
    this.stop?.();
  }

  run(): Promise<PurgeResult> {
    return this.purge.run();
  }
}
