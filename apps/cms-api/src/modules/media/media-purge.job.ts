import {
  Injectable,
  Inject,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';

import { MS_PER_HOUR } from '../../common/constants/time.constants';
import { Clock } from '../../common/time/clock';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import {
  MEDIA_STORAGE,
  type MediaStorage,
} from '../../infrastructure/media/storage.port';
import { ContentRegistryProvider } from '../content-engine';
import { allowedMediaTypeOf } from './domain/MediaUpload.rules';

/** Soft-deleted files are purged from storage once older than this (SPEC §9). */
export const MEDIA_PURGE_GRACE_MS = 24 * MS_PER_HOUR;
/** The purge job runs this often, in-process (one replica; see README). */
const MEDIA_PURGE_INTERVAL_MS = MS_PER_HOUR;
/** Rows read per query during a purge run (a run walks all eligible rows). */
export const MEDIA_PURGE_BATCH_SIZE = 100;
import { isMediaReferenced } from './media-usage';

/** What one purge run did. */
export interface PurgeResult {
  readonly purged: number;
  /** Still referenced (attached after the delete) or failed: left for later. */
  readonly skipped: number;
}

/**
 * Removes the stored object of files soft-deleted more than 24 h ago, then
 * the row. A file that a document points at again is left alone. Runs
 * in-process on an interval: with several replicas every one runs it, which
 * is harmless (deleting a missing object is not an error).
 */
@Injectable()
export class MediaPurgeJob implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(MediaPurgeJob.name);
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ContentRegistryProvider,
    private readonly clock: Clock,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => {
      void this.run().catch((error: unknown) => {
        this.logger.error(
          `Media purge failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      });
    }, MEDIA_PURGE_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
  }

  async run(): Promise<PurgeResult> {
    if (this.running) return { purged: 0, skipped: 0 };
    this.running = true;
    try {
      return await this.purgeBatch();
    } finally {
      this.running = false;
    }
  }

  /**
   * Walks every eligible row in id order, one batch at a time, so rows that
   * stay (still referenced, unknown type, storage error) never hold back the
   * rows behind them.
   */
  private async purgeBatch(): Promise<PurgeResult> {
    const cutoff = new Date(this.clock.now() - MEDIA_PURGE_GRACE_MS);
    const registry = await this.registry.registry();
    let purged = 0;
    let skipped = 0;
    let cursor = 0;
    for (;;) {
      const rows = await this.prisma.fileLibrary.findMany({
        where: { deletedAt: { lt: cutoff }, id: { gt: cursor } },
        orderBy: { id: 'asc' },
        take: MEDIA_PURGE_BATCH_SIZE,
        select: { id: true, storageKey: true, mimeType: true },
      });
      for (const row of rows) {
        cursor = row.id;
        try {
          if (await isMediaReferenced(this.prisma, registry, row.id)) {
            skipped += 1;
            continue;
          }
          const kind = allowedMediaTypeOf(row.mimeType)?.kind;
          if (kind === undefined) {
            skipped += 1;
            this.logger.error(`Media ${row.id} has an unknown type; kept.`);
            continue;
          }
          await this.storage.delete(row.storageKey, kind);
          await this.prisma.fileLibrary.delete({ where: { id: row.id } });
          purged += 1;
        } catch {
          skipped += 1;
          this.logger.error(`Could not purge media ${row.id}; will retry.`);
        }
      }
      if (rows.length < MEDIA_PURGE_BATCH_SIZE) return { purged, skipped };
    }
  }
}
