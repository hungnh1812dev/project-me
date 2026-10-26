import { ForbiddenException, Injectable } from '@nestjs/common';

import { PermissionAction } from '../../generated/prisma/client';
import {
  MEDIA_SUBJECT,
  AccessPolicyService,
  type ActorContext,
} from '../access';
import type { PageQuery } from '../../common/http/request-parsing';
import { ContentDbProvider } from '../content-engine';
import {
  DELETED_AT_COLUMN,
  MEDIA_ORDER,
  MEDIA_TABLE,
} from './domain/Media.constants';
import type { MediaPage, MediaRecord } from './domain/Media.entity';

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

/** File library: list. */
@Injectable()
export class MediaService {
  constructor(
    private readonly content: ContentDbProvider,
    private readonly access: AccessPolicyService,
  ) {}

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
