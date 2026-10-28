import type { OnModuleDestroy } from '@nestjs/common';
import type { Kysely } from 'kysely';

import type {
  ContentTypeRepository,
  StoredContentTypes,
} from '../application/ContentEngine.port';
import {
  CONTENT_DB_SCHEMA,
  META_TABLES,
} from '../domain/ContentEngine.constants';
import { ContentEngineError } from '../domain/ContentDocument.entity';
import { CONTENT_NOT_MIGRATED_PG_CODES } from './ContentDatabase.adapter';
import type { ContentMetaDatabase } from './MigrationRunner.adapter';

function isNotMigrated(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    CONTENT_NOT_MIGRATED_PG_CODES.includes(error.code)
  );
}

function hasSlug(definition: unknown, slug: string): boolean {
  return (
    typeof definition === 'object' &&
    definition !== null &&
    'slug' in definition &&
    definition.slug === slug
  );
}

/** Reads the types `content:migrate` synced into `content._content_types`. */
export class PgContentTypeRepository
  implements ContentTypeRepository, OnModuleDestroy
{
  constructor(private readonly db: Kysely<ContentMetaDatabase>) {}

  async loadDefinitions(): Promise<StoredContentTypes> {
    try {
      const rows = await this.db
        .withSchema(CONTENT_DB_SCHEMA)
        .selectFrom(META_TABLES.contentTypes)
        .select(['slug', 'definition'])
        .orderBy('slug')
        .execute();
      return {
        status: 'loaded',
        definitions: rows.map((row) => {
          // jsonb arrives parsed; the column type says string because writes send JSON text.
          const definition: unknown =
            typeof row.definition === 'string'
              ? JSON.parse(row.definition)
              : row.definition;
          if (!hasSlug(definition, row.slug)) {
            throw new ContentEngineError(
              `Registry row "${row.slug}" does not match its definition slug.`,
            );
          }
          return definition;
        }),
      };
    } catch (error) {
      if (isNotMigrated(error)) return { status: 'not-migrated' };
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.db.destroy();
  }
}
