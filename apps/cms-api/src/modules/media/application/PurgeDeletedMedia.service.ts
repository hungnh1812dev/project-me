import { Inject, Injectable } from '@nestjs/common';

import { Clock } from '../../../common/time/clock';
import {
  APP_LOGGER,
  type AppLogger,
} from '../../../infrastructure/logging/AppLogger.port';
import {
  MEDIA_PURGE_BATCH_SIZE,
  MEDIA_PURGE_GRACE_MS,
} from '../domain/Media.constants';
import { allowedMediaTypeOf } from '../domain/MediaUpload.rules';
import {
  MEDIA_REFERENCE_CHECKER,
  MEDIA_REPOSITORY,
  MEDIA_STORAGE,
  type MediaReferenceChecker,
  type MediaRepository,
  type MediaStorage,
} from './Media.port';

/** What one purge run did. */
export interface PurgeResult {
  readonly purged: number;
  /** Still referenced (attached after the delete) or failed: left for later. */
  readonly skipped: number;
}

/**
 * Removes the stored object of files soft-deleted more than 24 h ago, then
 * the row. A file that a document points at again is left alone. The object
 * goes first: a crash between the two leaves a row to retry, never an
 * orphaned object.
 */
@Injectable()
export class PurgeDeletedMediaService {
  private running = false;

  constructor(
    @Inject(MEDIA_REPOSITORY) private readonly repository: MediaRepository,
    @Inject(MEDIA_REFERENCE_CHECKER)
    private readonly references: MediaReferenceChecker,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
    private readonly clock: Clock,
    @Inject(APP_LOGGER) private readonly logger: AppLogger,
  ) {}

  async run(): Promise<PurgeResult> {
    if (this.running) return { purged: 0, skipped: 0 };
    this.running = true;
    try {
      return await this.purgeBatches();
    } finally {
      this.running = false;
    }
  }

  /**
   * Walks every eligible row in id order, one batch at a time, so rows that
   * stay (still referenced, unknown type, storage error) never hold back the
   * rows behind them.
   */
  private async purgeBatches(): Promise<PurgeResult> {
    const cutoff = new Date(this.clock.now() - MEDIA_PURGE_GRACE_MS);
    let purged = 0;
    let skipped = 0;
    let cursor = 0;
    for (;;) {
      const rows = await this.repository.findPurgeBatch(
        cutoff,
        cursor,
        MEDIA_PURGE_BATCH_SIZE,
      );
      for (const row of rows) {
        cursor = row.id;
        try {
          if (await this.references.isReferenced(row.id)) {
            skipped += 1;
            continue;
          }
          const kind = allowedMediaTypeOf(row.mimeType)?.kind;
          if (kind === undefined) {
            skipped += 1;
            this.logger.error(
              `Media ${row.id} has an unknown type; kept.`,
              PurgeDeletedMediaService.name,
            );
            continue;
          }
          await this.storage.delete(row.storageKey, kind);
          await this.repository.deleteRow(row.id);
          purged += 1;
        } catch {
          skipped += 1;
          this.logger.error(
            `Could not purge media ${row.id}; will retry.`,
            PurgeDeletedMediaService.name,
          );
        }
      }
      if (rows.length < MEDIA_PURGE_BATCH_SIZE) return { purged, skipped };
    }
  }
}
