import { randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { Clock } from '../../../common/time/clock';
import { MediaProvider } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import {
  APP_LOGGER,
  type AppLogger,
} from '../../../infrastructure/logging/AppLogger.port';
import {
  MEDIA_STORAGE,
  type MediaStorage,
} from '../../../infrastructure/media/storage.port';
import type { AccountActor } from '../../access';
import type { MediaRecord } from '../domain/Media.entity';
import { UUID_BYTES, uuidv7 } from '../domain/Uuidv7.rules';
import {
  UPLOAD_PROCESSOR,
  type UploadProcessor,
  type UploadStream,
} from './Media.port';

/** `POST /media`: receive, re-encode, store under a UUIDv7 key, record the row. */
@Injectable()
export class UploadMediaService {
  constructor(
    @Inject(UPLOAD_PROCESSOR) private readonly processor: UploadProcessor,
    // Transitional: the row write moves behind a repository port in CR-md-3.
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
    @Inject(APP_LOGGER) private readonly logger: AppLogger,
  ) {}

  /**
   * If the row cannot be written the stored object is removed again, so no
   * orphan is left behind. The temp file is removed on every path.
   */
  async upload(
    actor: AccountActor,
    upload: UploadStream,
  ): Promise<MediaRecord> {
    const received = await this.processor.receive(upload);
    try {
      const prepared = await this.processor.prepare(received);
      const key = uuidv7(this.clock.now(), randomBytes(UUID_BYTES));
      const stored = await this.storage.put({
        key,
        kind: prepared.kind,
        mimeType: prepared.mimeType,
        body: prepared.open(),
      });
      try {
        return await this.prisma.fileLibrary.create({
          data: {
            fileName: received.fileName,
            mimeType: prepared.mimeType,
            size: prepared.size,
            width: prepared.width,
            height: prepared.height,
            alt: received.alt,
            storageKey: key,
            sha256: prepared.sha256,
            url: stored.url,
            thumbnailUrl: stored.thumbnailUrl,
            provider: MediaProvider.cloudinary,
            createdById: actor.accountId,
            updatedById: actor.accountId,
          },
        });
      } catch (error) {
        await this.storage.delete(key, prepared.kind).catch(() => {
          this.logger.error(
            `Could not remove orphaned media object ${key}`,
            UploadMediaService.name,
          );
        });
        throw error;
      }
    } finally {
      await received.dispose();
    }
  }
}
