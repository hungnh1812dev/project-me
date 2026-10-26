import { randomBytes } from 'node:crypto';

import { ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';

import { Clock } from '../../common/time/clock';
import { MediaProvider, PermissionAction } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import {
  MEDIA_STORAGE,
  type MediaStorage,
} from '../../infrastructure/media/storage.port';
import {
  MEDIA_SUBJECT,
  AccessPolicyService,
  type ActorContext,
  type AccountActor,
} from '../access';
import type { PageQuery } from '../../common/http/request-parsing';
import { ContentDbProvider } from '../content-engine';
import {
  DELETED_AT_COLUMN,
  MEDIA_ORDER,
  MEDIA_TABLE,
} from './domain/Media.constants';
import type { MediaPage, MediaRecord } from './domain/Media.entity';
import { UUID_BYTES, uuidv7 } from './domain/Uuidv7.rules';
import { type UploadStream, UploadPipeline } from './upload.pipeline';

interface MediaRow {
  document_id: string;
  file_name: string;
  mime_type: string;
  size: number;
  width: number | null;
  height: number | null;
  alt: string | null;
  url: string;
  thumbnail_url: string | null;
  provider: string;
  is_reviewer_preset: boolean;
  created_at: Date;
}

const MEDIA_COLUMNS = [
  'document_id',
  'file_name',
  'mime_type',
  'size',
  'width',
  'height',
  'alt',
  'url',
  'thumbnail_url',
  'provider',
  'is_reviewer_preset',
  'created_at',
] as const;

function recordOfRow(row: MediaRow): MediaRecord {
  return {
    documentId: row.document_id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    size: row.size,
    width: row.width,
    height: row.height,
    alt: row.alt,
    url: row.url,
    thumbnailUrl: row.thumbnail_url,
    provider: row.provider,
    isReviewerPreset: row.is_reviewer_preset,
    createdAt: row.created_at,
  };
}

/** File library: upload and list. */
@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly pipeline: UploadPipeline,
    private readonly prisma: PrismaService,
    private readonly content: ContentDbProvider,
    private readonly access: AccessPolicyService,
    private readonly clock: Clock,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
  ) {}

  /**
   * Streams, validates and re-encodes the upload, stores it under a UUIDv7
   * key, then records it. If the row cannot be written the stored object is
   * removed again, so no orphan is left behind.
   */
  async upload(
    actor: AccountActor,
    upload: UploadStream,
  ): Promise<MediaRecord> {
    const received = await this.pipeline.receive(upload);
    try {
      const prepared = await this.pipeline.prepare(received);
      const key = uuidv7(this.clock.now(), randomBytes(UUID_BYTES));
      const stored = await this.storage.put({
        key,
        kind: prepared.kind,
        mimeType: prepared.mimeType,
        body: prepared.open(),
      });
      try {
        const row = await this.prisma.fileLibrary.create({
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
        return row;
      } catch (error) {
        await this.storage.delete(key, prepared.kind).catch(() => {
          this.logger.error(`Could not remove orphaned media object ${key}`);
        });
        throw error;
      }
    } finally {
      await received.dispose();
    }
  }

  /**
   * Newest first. The policy's row filter for `media` read decides which rows
   * the actor sees: read-only actors (reviewer) only get preset rows, whatever
   * their role is called. Soft-deleted rows are never listed.
   */
  async list(actor: ActorContext, query: PageQuery): Promise<MediaPage> {
    const { evaluator } = await this.access.policy();
    const filter = evaluator.rowFilter(
      actor,
      PermissionAction.read,
      MEDIA_SUBJECT,
    );
    if (!filter.allowed) throw new ForbiddenException();

    const { page, pageSize } = query;
    const base = this.content.db
      .selectFrom(MEDIA_TABLE)
      .where(DELETED_AT_COLUMN, 'is', null)
      .$if(filter.where !== null, (qb) =>
        qb.where(filter.where as NonNullable<typeof filter.where>),
      );
    const [rows, counted] = await Promise.all([
      base
        .select([...MEDIA_COLUMNS])
        .orderBy(MEDIA_ORDER.CREATED_AT, 'desc')
        .orderBy(MEDIA_ORDER.ID, 'desc')
        .limit(pageSize)
        .offset((page - 1) * pageSize)
        .execute(),
      base.select((eb) => eb.fn.countAll().as('total')).executeTakeFirst(),
    ]);
    return {
      data: (rows as unknown as MediaRow[]).map(recordOfRow),
      meta: { page, pageSize, total: Number(counted?.['total'] ?? 0) },
    };
  }
}
