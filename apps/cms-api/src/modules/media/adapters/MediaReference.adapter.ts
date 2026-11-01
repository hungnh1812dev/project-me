import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/database/Prisma.service';
import { prismaTxOf } from '../../../infrastructure/database/PrismaTransactionRunner.adapter';
import type { UnitOfWork } from '../../../infrastructure/database/TransactionRunner.port';
import {
  CONTENT_DB_SCHEMA,
  ContentRegistry,
  mediaColumnsOf,
  quoteIdentifier,
  richtextColumnsOf,
  type ContentTypeRegistry,
} from '../../content-engine';
import type { MediaReferenceChecker } from '../application/Media.port';

const FILE_TABLE = 'public.file_library';

/**
 * Matches a real `<img>` element carrying the file's id, never visible text:
 * the sanitizer escapes `<` in text, so `<img` only appears as an element. The
 * id is a lowercase uuid, safe inside a regular expression.
 */
const RICHTEXT_IMAGE_PATTERN_PREFIX = '<img\\s[^>]*\\sdata-media-id="';

/**
 * `select exists(...) or exists(...) as used` over every `media` column
 * (`= $1`, the internal id) and every `richtext` column (`col ~ (<img pattern> || $2 || '"')`,
 * `$2` = the file's lowercase `document_id`) of every content table (roots and
 * components). Draft and published rows share the tables, so a hit in either
 * counts. Names come from the validated registry and are quoted; both values
 * are bound parameters, typed in the `from` clause so either probe kind may be
 * absent. Null when no content type has a media or richtext field.
 */
export function mediaReferenceQuery(registry: ContentTypeRegistry): string | null {
  const table = (name: string) => `${quoteIdentifier(CONTENT_DB_SCHEMA)}.${quoteIdentifier(name)}`;
  const probes = [
    ...mediaColumnsOf(registry).map(
      ({ tableName, columnName }) =>
        `exists (select 1 from ${table(tableName)} where ${quoteIdentifier(columnName)} = $1)`,
    ),
    ...richtextColumnsOf(registry).map(
      ({ tableName, columnName }) =>
        `exists (select 1 from ${table(tableName)} where ${quoteIdentifier(columnName)} ~ ('${RICHTEXT_IMAGE_PATTERN_PREFIX}' || $2 || '"'))`,
    ),
  ];
  return probes.length === 0
    ? null
    : `select ${probes.join(' or ')} as used from (select $1::int, $2::text) as bound_values`;
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
    const files = await runner.$queryRawUnsafe<{ documentId: string }[]>(
      `select document_id::text as "documentId" from ${FILE_TABLE} where id = $1`,
      mediaId,
    );
    const file = files[0];
    if (file === undefined) return false;
    const rows = await runner.$queryRawUnsafe<{ used: boolean }[]>(query, mediaId, file.documentId);
    return rows[0]?.used === true;
  }
}
