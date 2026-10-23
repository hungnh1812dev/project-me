import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';

import { Clock } from '../../common/time/clock';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { VersionCache, REVIEWER_ROLE_SLUG } from '../access';
import {
  REVIEWER_CLEANUP_BATCH_SIZE,
  REVIEWER_CLEANUP_INTERVAL_MS,
} from './reviewer.constants';

/**
 * Deletes reviewer accounts whose session has expired (T31). The session row
 * and refresh/OTP rows go with the account (cascade); audit rows keep their
 * text and lose only the actor link (SET NULL). In-process on an interval;
 * several replicas each run it, which is harmless.
 */
@Injectable()
export class ReviewerCleanupJob
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(ReviewerCleanupJob.name);
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly versions: VersionCache,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => {
      void this.run().catch((error: unknown) => {
        this.logger.error(
          `Reviewer cleanup failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      });
    }, REVIEWER_CLEANUP_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
  }

  /** Returns how many accounts were deleted. */
  async run(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      let deleted = 0;
      for (;;) {
        const rows = await this.prisma.account.findMany({
          where: {
            roleSlug: REVIEWER_ROLE_SLUG,
            reviewerSessions: {
              every: { expiresAt: { lt: new Date(this.clock.now()) } },
            },
          },
          orderBy: { id: 'asc' },
          take: REVIEWER_CLEANUP_BATCH_SIZE,
          select: { id: true },
        });
        if (rows.length === 0) return deleted;
        const ids = rows.map((row) => row.id);
        await this.prisma.account.deleteMany({
          where: { id: { in: ids }, roleSlug: REVIEWER_ROLE_SLUG },
        });
        for (const id of ids) this.versions.invalidateAccount(id);
        deleted += ids.length;
        if (rows.length < REVIEWER_CLEANUP_BATCH_SIZE) return deleted;
      }
    } finally {
      this.running = false;
    }
  }
}
