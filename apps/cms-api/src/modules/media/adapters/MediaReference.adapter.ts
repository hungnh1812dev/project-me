import { Injectable } from '@nestjs/common';

import { prismaTxOf } from '../../../infrastructure/database/PrismaTransactionRunner.adapter';
import { PrismaService } from '../../../infrastructure/database/Prisma.service';
import type { UnitOfWork } from '../../../infrastructure/database/TransactionRunner.port';
import {
  CONTENT_DB_SCHEMA,
  ContentRegistry,
  mediaColumnsOf,
  quoteIdentifier,
} from '../../content-engine';
import type { ContentTypeRegistry } from '../../content-engine';
import type { MediaReferenceChecker } from '../application/Media.port';

/**
 * `select exists(...) or exists(...) as used` over every `media` column of
 * every content table (roots and components). Draft and published rows share
 * the tables, so a hit in either counts. Names come from the validated
 * registry and are quoted; the file id is the bound parameter `$1`. Null when
 * no content type has a media field.
 */
export function mediaReferenceQuery(
  registry: ContentTypeRegistry,
): string | null {
  const probes = mediaColumnsOf(registry).map(
    ({ tableName, columnName }) =>
      `exists (select 1 from ${quoteIdentifier(CONTENT_DB_SCHEMA)}.${quoteIdentifier(tableName)} where ${quoteIdentifier(columnName)} = $1)`,
  );
  return probes.length === 0 ? null : `select ${probes.join(' or ')} as used`;
}

@Injectable()
export class MediaReferenceAdapter implements MediaReferenceChecker {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ContentRegistry,
  ) {}

  async isReferenced(mediaId: number, unit?: UnitOfWork): Promise<boolean> {
    const query = mediaReferenceQuery(await this.registry.registry());
    if (query === null) return false;
    const runner = unit === undefined ? this.prisma : prismaTxOf(unit);
    const rows = await runner.$queryRawUnsafe<{ used: boolean }[]>(
      query,
      mediaId,
    );
    return rows[0]?.used === true;
  }
}
