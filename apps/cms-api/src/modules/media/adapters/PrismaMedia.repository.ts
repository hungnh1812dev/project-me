import { Injectable } from '@nestjs/common';
import { sql } from 'kysely';

import { MediaProvider } from '../../../generated/prisma/client';
import { prismaTxOf } from '../../../infrastructure/database/PrismaTransactionRunner.adapter';
import { PrismaService } from '../../../infrastructure/database/Prisma.service';
import type { UnitOfWork } from '../../../infrastructure/database/TransactionRunner.port';
import type { RowCondition } from '../../access';
import { ContentDbProvider } from '../../content-engine';
import type {
  EmbeddableFile,
  MediaRepository,
  NewMediaFile,
  PurgeCandidate,
} from '../application/Media.port';
import type { MediaPage, MediaRecord } from '../domain/Media.entity';

const MEDIA_TABLE = 'public.file_library';
const DELETED_AT_COLUMN = 'deleted_at';
const MEDIA_ORDER = { CREATED_AT: 'created_at', ID: 'id' } as const;

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

/** What a document read embeds, plus the id the document stores. */
const EMBED_COLUMNS = [
  'id',
  'document_id',
  'file_name',
  'url',
  'thumbnail_url',
  'provider',
  'alt',
  'size',
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

/**
 * The row condition is a Kysely expression, so reads and the alt write go
 * through the content database handle; the other writes use Prisma.
 * Statements that must commit together run on the unit's Prisma transaction.
 */
@Injectable()
export class PrismaMediaRepository implements MediaRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly content: ContentDbProvider,
  ) {}

  create(file: NewMediaFile): Promise<MediaRecord> {
    return this.prisma.fileLibrary.create({
      data: {
        ...file,
        // The column is an enum with one live value; the fake storage reports it too.
        provider: MediaProvider.cloudinary,
        updatedById: file.createdById,
      },
    });
  }

  async list(selection: {
    rowCondition: RowCondition | null;
    page: number;
    pageSize: number;
  }): Promise<MediaPage> {
    const { rowCondition, page, pageSize } = selection;
    const base = this.content.db
      .selectFrom(MEDIA_TABLE)
      .where(DELETED_AT_COLUMN, 'is', null)
      .$if(rowCondition !== null, (qb) =>
        qb.where(rowCondition as NonNullable<typeof rowCondition>),
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

  async findLiveId(
    documentId: string,
    rowCondition: RowCondition | null,
  ): Promise<number | undefined> {
    const row = await this.content.db
      .selectFrom(MEDIA_TABLE)
      .select('id')
      .where('document_id', '=', documentId)
      .where(DELETED_AT_COLUMN, 'is', null)
      .$if(rowCondition !== null, (qb) =>
        qb.where(rowCondition as NonNullable<typeof rowCondition>),
      )
      .executeTakeFirst();
    return row === undefined ? undefined : Number((row as { id: number }).id);
  }

  async updateAlt(change: {
    documentId: string;
    alt: string | null;
    updatedById: number;
    rowCondition: RowCondition | null;
  }): Promise<MediaRecord | undefined> {
    const { documentId, alt, updatedById, rowCondition } = change;
    const row = await this.content.db
      .updateTable(MEDIA_TABLE)
      .set({ alt, updated_by: updatedById, updated_at: sql`now()` })
      .where('document_id', '=', documentId)
      .where(DELETED_AT_COLUMN, 'is', null)
      .$if(rowCondition !== null, (qb) =>
        qb.where(rowCondition as NonNullable<typeof rowCondition>),
      )
      .returning([...MEDIA_COLUMNS])
      .executeTakeFirst();
    return row === undefined
      ? undefined
      : recordOfRow(row as unknown as MediaRow);
  }

  async lockLive(unit: UnitOfWork, mediaId: number): Promise<boolean> {
    const locked = await prismaTxOf(unit).$queryRaw<{ id: number }[]>`
      select id from public.file_library
      where id = ${mediaId} and deleted_at is null for update`;
    return locked.length > 0;
  }

  softDelete(
    unit: UnitOfWork,
    change: { mediaId: number; deletedAt: Date; updatedById: number },
  ): Promise<{ documentId: string; mimeType: string }> {
    return prismaTxOf(unit).fileLibrary.update({
      where: { id: change.mediaId },
      data: { deletedAt: change.deletedAt, updatedById: change.updatedById },
      select: { documentId: true, mimeType: true },
    });
  }

  async findReadableIds(
    documentIds: readonly string[],
    rowCondition: RowCondition | null,
  ): Promise<ReadonlyMap<string, number>> {
    const rows = await this.content.db
      .selectFrom(MEDIA_TABLE)
      .select(['id', 'document_id'])
      .where('document_id', '=', sql<string>`any(${[...documentIds]}::uuid[])`)
      .where(DELETED_AT_COLUMN, 'is', null)
      .$if(rowCondition !== null, (qb) =>
        qb.where(rowCondition as NonNullable<typeof rowCondition>),
      )
      .execute();
    return new Map(
      rows.map((row) => [row.document_id as string, row.id as number]),
    );
  }

  async findEmbeddable(ids: {
    internalIds: readonly number[];
    documentIds: readonly string[];
  }): Promise<EmbeddableFile[]> {
    const base = () =>
      this.content.db
        .selectFrom(MEDIA_TABLE)
        .select([...EMBED_COLUMNS])
        .where(DELETED_AT_COLUMN, 'is', null);
    const found = [
      ...(ids.internalIds.length > 0
        ? await base()
            .where('id', '=', sql<number>`any(${[...ids.internalIds]}::int[])`)
            .execute()
        : []),
      ...(ids.documentIds.length > 0
        ? await base()
            .where(
              'document_id',
              '=',
              sql<string>`any(${[...ids.documentIds]}::uuid[])`,
            )
            .execute()
        : []),
    ];
    return found.map((row) => ({
      internalId: row.id as number,
      file: {
        id: row.document_id as string,
        fileName: row.file_name as string,
        url: row.url as string,
        thumbnailUrl: (row.thumbnail_url as string | null) ?? null,
        provider: row.provider as string,
        alt: (row.alt as string | null) ?? null,
        size: row.size as number,
        createdAt: (row.created_at as Date).toISOString(),
      },
    }));
  }

  findPurgeBatch(
    cutoff: Date,
    afterId: number,
    limit: number,
  ): Promise<PurgeCandidate[]> {
    return this.prisma.fileLibrary.findMany({
      where: { deletedAt: { lt: cutoff }, id: { gt: afterId } },
      orderBy: { id: 'asc' },
      take: limit,
      select: { id: true, storageKey: true, mimeType: true },
    });
  }

  async deleteRow(mediaId: number): Promise<void> {
    await this.prisma.fileLibrary.delete({ where: { id: mediaId } });
  }
}
