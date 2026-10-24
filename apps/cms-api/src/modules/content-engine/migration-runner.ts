import { type Generated, type Kysely, sql } from 'kysely';

import {
  CONTENT_DB_SCHEMA,
  META_TABLES,
  MIGRATION_LOCK_KEY,
} from './content-engine.constants';
import type { ContentTypeKind } from './definition.schema';
import {
  ContentEngineError,
  listMigrations,
  type MigrationFile,
  readSnapshot,
} from './migration-files';
import { quoteIdentifier } from './sql-generator';

/** Kysely view of the engine's bookkeeping tables in schema `content`. */
export interface ContentMetaDatabase {
  [META_TABLES.migrations]: {
    name: string;
    checksum: string;
    applied_at: Generated<Date>;
  };
  [META_TABLES.contentTypes]: {
    id: Generated<number>;
    slug: string;
    kind: ContentTypeKind;
    draft_and_publish: boolean;
    definition: string;
    definition_hash: string;
    created_at: Generated<Date>;
    updated_at: Generated<Date>;
  };
}

export interface MigrateResult {
  applied: string[];
  /** Slugs inserted or updated in `_content_types`. */
  upserted: string[];
  /** Slugs removed from `_content_types` (definition no longer exists). */
  removed: string[];
}

const SCHEMA = quoteIdentifier(CONTENT_DB_SCHEMA);

/**
 * Static DDL (no input) creating the bookkeeping tables. Runs after the
 * advisory lock is taken, so concurrent first runs cannot race on it.
 */
const BOOTSTRAP_SQL = `
CREATE SCHEMA IF NOT EXISTS ${SCHEMA};
CREATE TABLE IF NOT EXISTS ${SCHEMA}.${quoteIdentifier(META_TABLES.migrations)} (
  "name" text PRIMARY KEY,
  "checksum" text NOT NULL,
  "applied_at" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ${SCHEMA}.${quoteIdentifier(META_TABLES.contentTypes)} (
  "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "slug" text NOT NULL UNIQUE,
  "kind" text NOT NULL CHECK ("kind" IN ('single', 'collection')),
  "draft_and_publish" boolean NOT NULL,
  "definition" jsonb NOT NULL,
  "definition_hash" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
`;

function findPending(
  files: MigrationFile[],
  applied: Map<string, string>,
): MigrationFile[] {
  const byName = new Map(files.map((file) => [file.name, file]));
  for (const [name, checksum] of applied) {
    const file = byName.get(name);
    if (file === undefined) {
      throw new ContentEngineError(
        `Applied migration ${name} is missing from the migrations folder.`,
      );
    }
    if (file.checksum !== checksum) {
      throw new ContentEngineError(
        `Applied migration ${name} was edited after it ran (checksum mismatch). Restore it and add a new migration instead.`,
      );
    }
  }

  const pending = files.filter((file) => !applied.has(file.name));
  const lastApplied = files.reduce(
    (max, file) => (applied.has(file.name) ? file.sequence : max),
    0,
  );
  const outOfOrder = pending.find((file) => file.sequence < lastApplied);
  if (outOfOrder !== undefined) {
    throw new ContentEngineError(
      `Migration ${outOfOrder.name} is older than an applied migration. Regenerate it with content:generate.`,
    );
  }
  return pending;
}

/**
 * Applies pending content migrations and syncs `_content_types` with the
 * snapshot, all in one transaction under a transaction-scoped advisory lock.
 * A concurrent run waits for the lock, then finds nothing pending.
 */
export async function runContentMigrations(
  db: Kysely<ContentMetaDatabase>,
  migrationsDir: string,
): Promise<MigrateResult> {
  const files = await listMigrations(migrationsDir);
  const snapshot = await readSnapshot(migrationsDir);

  return db.transaction().execute(async (trx) => {
    await sql`SELECT pg_advisory_xact_lock(${MIGRATION_LOCK_KEY})`.execute(trx);
    await sql.raw(BOOTSTRAP_SQL).execute(trx);

    const meta = trx.withSchema(CONTENT_DB_SCHEMA);
    const appliedRows = await meta
      .selectFrom(META_TABLES.migrations)
      .select(['name', 'checksum'])
      .execute();
    const pending = findPending(
      files,
      new Map(appliedRows.map((row) => [row.name, row.checksum])),
    );

    for (const migration of pending) {
      // Migration files are generated from validated definitions and
      // committed; they are trusted repository content, never request input.
      await sql.raw(migration.sql).execute(trx);
      await meta
        .insertInto(META_TABLES.migrations)
        .values({ name: migration.name, checksum: migration.checksum })
        .execute();
    }

    const upserted: string[] = [];
    for (const [slug, entry] of Object.entries(snapshot.contentTypes)) {
      const row = {
        slug,
        kind: entry.definition.kind,
        draft_and_publish: entry.definition.draftAndPublish,
        definition: JSON.stringify(entry.definition),
        definition_hash: entry.hash,
      };
      const upsertOutcome = await meta
        .insertInto(META_TABLES.contentTypes)
        .values(row)
        .onConflict((conflict) =>
          conflict
            .column('slug')
            .doUpdateSet({
              kind: row.kind,
              draft_and_publish: row.draft_and_publish,
              definition: row.definition,
              definition_hash: row.definition_hash,
              updated_at: sql<Date>`now()`,
            })
            .where(
              `${META_TABLES.contentTypes}.definition_hash`,
              '<>',
              row.definition_hash,
            ),
        )
        .executeTakeFirst();
      if (Number(upsertOutcome.numInsertedOrUpdatedRows ?? 0) > 0) upserted.push(slug);
    }

    const slugs = Object.keys(snapshot.contentTypes);
    let removeQuery = meta
      .deleteFrom(META_TABLES.contentTypes)
      .returning('slug');
    if (slugs.length > 0) {
      removeQuery = removeQuery.where('slug', 'not in', slugs);
    }
    const removed = await removeQuery.execute();

    return {
      applied: pending.map((migration) => migration.name),
      upserted,
      removed: removed.map((row) => row.slug),
    };
  });
}
