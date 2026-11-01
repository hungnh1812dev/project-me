import { randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { Clock } from '../../../common/time/Clock.service';
import type { ClientMeta } from '../../../common/types/ClientMeta.entity';
import {
  CORE_TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../infrastructure/database/TransactionRunner.port';
import { APP_LOGGER, type AppLogger } from '../../../infrastructure/logging/AppLogger.port';
import { MEDIA_SUBJECT, PermissionAction, type AccountActor } from '../../access';
import { AUDIT_ACTIONS, auditActorOf, SecurityAuditService } from '../../security-audit';
import { mediaFamilyMismatch, mediaNotFound, type MediaRecord } from '../domain/Media.entity';
import { isSameMediaFamily } from '../domain/MediaUpload.rules';
import { UUID_BYTES, uuidv7 } from '../domain/Uuidv7.rules';
import {
  MEDIA_REPOSITORY,
  MEDIA_STORAGE,
  UPLOAD_PROCESSOR,
  type MediaRepository,
  type MediaStorage,
  type ReplacementFile,
  type UploadProcessor,
  type UploadStream,
} from './Media.port';
import { MediaLibraryService } from './MediaLibrary.service';

/**
 * `PUT /media/:id/file`: the upload pipeline for a new file, then a swap on
 * the existing row. Id, alt and creator stay; the old object stays in storage
 * under a soft-deleted row until the purge job removes it. If anything fails
 * the new object is removed and the row and old object are untouched.
 */
@Injectable()
export class ReplaceMediaFileService {
  constructor(
    @Inject(UPLOAD_PROCESSOR) private readonly processor: UploadProcessor,
    @Inject(MEDIA_REPOSITORY) private readonly repository: MediaRepository,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
    @Inject(CORE_TRANSACTION_RUNNER) private readonly runner: TransactionRunner,
    @Inject(APP_LOGGER) private readonly logger: AppLogger,
    private readonly library: MediaLibraryService,
    private readonly audit: SecurityAuditService,
    private readonly clock: Clock,
  ) {}

  async replace(
    actor: AccountActor,
    documentId: string,
    upload: UploadStream,
    meta: ClientMeta,
  ): Promise<MediaRecord> {
    const rowCondition = await this.library.rowConditionOf(actor, PermissionAction.update);
    const target = await this.repository.findLiveTarget(documentId, rowCondition);
    if (target === undefined) throw mediaNotFound();

    const received = await this.processor.receive(upload, { acceptsAlt: false });
    try {
      const prepared = await this.processor.prepare(received);
      if (!isSameMediaFamily(target.mimeType, prepared.mimeType)) throw mediaFamilyMismatch();
      const storageKey = uuidv7(this.clock.now(), randomBytes(UUID_BYTES));
      const stored = await this.storage.put({
        key: storageKey,
        kind: prepared.kind,
        mimeType: prepared.mimeType,
        body: prepared.open(),
      });
      try {
        return await this.swapRow(actor, target.id, meta, {
          fileName: received.fileName,
          mimeType: prepared.mimeType,
          size: prepared.size,
          width: prepared.width,
          height: prepared.height,
          storageKey,
          sha256: prepared.sha256,
          url: stored.url,
          thumbnailUrl: stored.thumbnailUrl,
          provider: this.storage.provider,
        });
      } catch (error) {
        await this.storage.delete(storageKey, prepared.kind).catch(() => {
          this.logger.error(
            `Could not remove orphaned media object ${storageKey}`,
            ReplaceMediaFileService.name,
          );
        });
        throw error;
      }
    } finally {
      await received.dispose();
    }
  }

  private swapRow(
    actor: AccountActor,
    mediaId: number,
    meta: ClientMeta,
    file: ReplacementFile,
  ): Promise<MediaRecord> {
    return this.runner.run(async (unit) => {
      // The row lock serialises a replace with a delete or another replace.
      if (!(await this.repository.lockLive(unit, mediaId))) throw mediaNotFound();
      const { record, previousSha256 } = await this.repository.replaceFile(unit, {
        mediaId,
        file,
        replacedAt: new Date(this.clock.now()),
        updatedById: actor.accountId,
      });
      await this.audit.record(unit, {
        actor: auditActorOf(actor),
        action: AUDIT_ACTIONS.MEDIA_REPLACED,
        subject: MEDIA_SUBJECT,
        targetId: record.documentId,
        metadata: { previousSha256, sha256: file.sha256 },
        ip: meta.ip,
      });
      return record;
    });
  }
}
