import { createHash } from 'node:crypto';

import {
  COLUMN_TYPES,
  COMPONENT_SYSTEM_COLUMNS,
  CONTENT_DB_SCHEMA,
  HASH_ALGORITHM,
  ROOT_SYSTEM_COLUMNS,
  SNAPSHOT_FORMAT_VERSION,
} from './content-engine.constants';
import {
  type ContentTypeDefinition,
  isComponentField,
} from './definition.schema';
import {
  type ColumnPlan,
  planTables,
  relationNames,
  type TablePlan,
} from './naming';

/**
 * Pure part of `content:generate`: turns the previous snapshot and the
 * current definitions into DDL. Every identifier comes from `planTables()`
 * (validated against `^[a-z][a-z0-9_]*$`) and is quoted; no request input
 * ever reaches this code.
 */

export interface SnapshotEntry {
  hash: string;
  definition: ContentTypeDefinition;
}

/** State of all definitions as of the latest generated migration. */
export interface DefinitionSnapshot {
  formatVersion: typeof SNAPSHOT_FORMAT_VERSION;
  contentTypes: Record<string, SnapshotEntry>;
}

export interface MigrationPlan {
  /** DDL statements, each terminated with `;`. */
  statements: string[];
  /** Human-readable list of changes that can lose data. */
  destructiveChanges: string[];
  /** Slugs whose definition hash changed, appeared or disappeared. */
  changedSlugs: string[];
  /** The snapshot to store once this plan is written. */
  nextSnapshot: DefinitionSnapshot;
}

type RootSystemColumn = (typeof ROOT_SYSTEM_COLUMNS)[number];
type ComponentSystemColumn = (typeof COMPONENT_SYSTEM_COLUMNS)[number];

/** DDL of engine-owned columns (SPEC §8.2). Typed so every column has one. */
const ROOT_SYSTEM_COLUMN_DDL: Record<RootSystemColumn, string> = {
  id: 'integer GENERATED ALWAYS AS IDENTITY',
  document_id: 'uuid NOT NULL',
  version: 'integer NOT NULL DEFAULT 1',
  published_at: 'timestamptz',
  locale: 'text',
  created_at: 'timestamptz NOT NULL DEFAULT now()',
  updated_at: 'timestamptz NOT NULL DEFAULT now()',
  created_by: 'integer',
  updated_by: 'integer',
};

const COMPONENT_SYSTEM_COLUMN_DDL: Record<ComponentSystemColumn, string> = {
  id: 'integer GENERATED ALWAYS AS IDENTITY',
  component_uid: 'uuid NOT NULL',
  parent_id: 'integer NOT NULL',
  order_index: 'integer NOT NULL DEFAULT 0',
};

const INDENT = '  ';

export function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function qualified(table: string): string {
  return `${quoteIdentifier(CONTENT_DB_SCHEMA)}.${quoteIdentifier(table)}`;
}

/** Physical type of a column. Component fields never become columns. */
export function columnType(column: ColumnPlan): string {
  const { field } = column;
  if (isComponentField(field)) {
    throw new Error(`Component field "${field.name}" has no column type`);
  }
  return COLUMN_TYPES[field.type];
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, child]) => [key, sortKeys(child)]),
    );
  }
  return value;
}

/** Stable hash: key order does not matter, field order does. */
export function hashDefinition(definition: ContentTypeDefinition): string {
  return createHash(HASH_ALGORITHM)
    .update(JSON.stringify(sortKeys(definition)))
    .digest('hex');
}

export function emptySnapshot(): DefinitionSnapshot {
  return { formatVersion: SNAPSHOT_FORMAT_VERSION, contentTypes: {} };
}

export function buildSnapshot(
  definitions: readonly ContentTypeDefinition[],
): DefinitionSnapshot {
  const sorted = [...definitions].sort((a, b) =>
    a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0,
  );
  return {
    formatVersion: SNAPSHOT_FORMAT_VERSION,
    contentTypes: Object.fromEntries(
      sorted.map((definition) => [
        definition.slug,
        { hash: hashDefinition(definition), definition },
      ]),
    ),
  };
}

function createTableSql(table: TablePlan): string[] {
  const systemDdl: Record<string, string> =
    table.kind === 'root'
      ? ROOT_SYSTEM_COLUMN_DDL
      : COMPONENT_SYSTEM_COLUMN_DDL;
  const lines = [
    ...table.systemColumns.map(
      (name) => `${quoteIdentifier(name)} ${systemDdl[name]}`,
    ),
    ...table.columns.map(
      (column) => `${quoteIdentifier(column.name)} ${columnType(column)}`,
    ),
    `CONSTRAINT ${quoteIdentifier(relationNames.primaryKey(table.name))} PRIMARY KEY ("id")`,
  ];
  if (table.parentTable !== null) {
    lines.push(
      `CONSTRAINT ${quoteIdentifier(relationNames.parentForeignKey(table.name))} FOREIGN KEY ("parent_id") REFERENCES ${qualified(table.parentTable)} ("id") ON DELETE CASCADE`,
    );
  }

  const target = qualified(table.name);
  const statements = [
    `CREATE TABLE ${target} (\n${lines.map((line) => `${INDENT}${line}`).join(',\n')}\n);`,
  ];
  if (table.kind === 'root') {
    statements.push(
      `CREATE UNIQUE INDEX ${quoteIdentifier(relationNames.draftUnique(table.name))} ON ${target} ("document_id") WHERE "published_at" IS NULL;`,
      `CREATE UNIQUE INDEX ${quoteIdentifier(relationNames.publishedUnique(table.name))} ON ${target} ("document_id") WHERE "published_at" IS NOT NULL;`,
      `CREATE INDEX ${quoteIdentifier(relationNames.publishedListIndex(table.name))} ON ${target} ("published_at", "created_at" DESC);`,
    );
  } else {
    statements.push(
      `CREATE INDEX ${quoteIdentifier(relationNames.parentOrderIndex(table.name))} ON ${target} ("parent_id", "order_index");`,
    );
  }
  return statements;
}

function tablesOf(snapshot: DefinitionSnapshot): TablePlan[] {
  return Object.values(snapshot.contentTypes).flatMap((entry) =>
    planTables(entry.definition),
  );
}

/**
 * Diffs the previous snapshot against the current (already validated)
 * definitions. Additions come first in parent-before-child order; drops of
 * whole tables come last, children first.
 */
export function planMigration(
  previous: DefinitionSnapshot,
  definitions: readonly ContentTypeDefinition[],
): MigrationPlan {
  const nextSnapshot = buildSnapshot(definitions);
  const previousTables = new Map(
    tablesOf(previous).map((table) => [table.name, table]),
  );
  const nextTables = tablesOf(nextSnapshot);
  const nextNames = new Set(nextTables.map((table) => table.name));

  const statements: string[] = [];
  const destructiveChanges: string[] = [];

  if (Object.keys(previous.contentTypes).length === 0 && nextTables.length) {
    statements.push(
      `CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(CONTENT_DB_SCHEMA)};`,
    );
  }

  for (const table of nextTables) {
    const before = previousTables.get(table.name);
    if (before === undefined) {
      statements.push(...createTableSql(table));
      continue;
    }
    const target = qualified(table.name);
    const oldColumns = new Map(
      before.columns.map((column) => [column.name, column]),
    );
    const newColumnNames = new Set(table.columns.map((column) => column.name));

    for (const column of table.columns) {
      const old = oldColumns.get(column.name);
      const type = columnType(column);
      if (old === undefined) {
        statements.push(
          `ALTER TABLE ${target} ADD COLUMN ${quoteIdentifier(column.name)} ${type};`,
        );
      } else if (columnType(old) !== type) {
        const name = quoteIdentifier(column.name);
        statements.push(
          `ALTER TABLE ${target} ALTER COLUMN ${name} TYPE ${type} USING ${name}::${type};`,
        );
        destructiveChanges.push(
          `Change type of ${table.name}.${column.name} from ${columnType(old)} to ${type}`,
        );
      }
    }
    for (const old of before.columns) {
      if (!newColumnNames.has(old.name)) {
        statements.push(
          `ALTER TABLE ${target} DROP COLUMN ${quoteIdentifier(old.name)};`,
        );
        destructiveChanges.push(`Drop column ${table.name}.${old.name}`);
      }
    }
  }

  const dropped = [...previousTables.values()]
    .filter((table) => !nextNames.has(table.name))
    .reverse();
  for (const table of dropped) {
    statements.push(`DROP TABLE ${qualified(table.name)};`);
    destructiveChanges.push(`Drop table ${table.name}`);
  }

  const slugs = new Set([
    ...Object.keys(previous.contentTypes),
    ...Object.keys(nextSnapshot.contentTypes),
  ]);
  const changedSlugs = [...slugs]
    .filter(
      (slug) =>
        previous.contentTypes[slug]?.hash !==
        nextSnapshot.contentTypes[slug]?.hash,
    )
    .sort();

  return { statements, destructiveChanges, changedSlugs, nextSnapshot };
}

/** File body of a migration. Metadata-only changes produce a comment-only file. */
export function renderMigrationSql(plan: MigrationPlan): string {
  const header = [
    '-- Generated by content:generate. Never edit a migration once applied.',
    `-- Content types: ${plan.changedSlugs.join(', ')}`,
  ];
  if (plan.statements.length === 0) {
    header.push('-- Definition metadata only: no DDL needed.');
  }
  return `${[...header, '', ...plan.statements].join('\n')}\n`;
}
