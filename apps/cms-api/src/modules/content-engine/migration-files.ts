import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

import {
  MIGRATION_FILE_PATTERN,
  MIGRATION_SEQUENCE_DIGITS,
  MIGRATION_SNAPSHOT_FILE,
  SCHEMA_FILE_EXTENSION,
} from './adapters/ContentEnginePersistence.constants';
import {
  HASH_ALGORITHM,
  SNAPSHOT_FORMAT_VERSION,
} from './domain/ContentEngine.constants';
import { ContentEngineError } from './domain/ContentEngine.errors';
import type { ContentTypeDefinition } from './domain/DefinitionSchema.rules';
import {
  formatDefinitionPath,
  validateDefinitions,
} from './domain/DefinitionValidator.rules';
import {
  type DefinitionSnapshot,
  emptySnapshot,
  hashDefinition,
} from './domain/SqlGenerator.rules';

/** File-system side of the content engine CLIs (schemas in, migrations out). */

export interface MigrationFile {
  name: string;
  sequence: number;
  sql: string;
  checksum: string;
}

const UTF8 = 'utf8';

/** No `instanceof Error`: fs errors can come from another realm (e.g. Jest). */
function isMissing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}

export function checksumOf(text: string): string {
  return createHash(HASH_ALGORITHM).update(text).digest('hex');
}

/**
 * Reads and validates every `<slug>.json` in `schemasDir`. Errors name the
 * file and the JSON path.
 */
export async function loadDefinitions(
  schemasDir: string,
): Promise<ContentTypeDefinition[]> {
  const files = (await readdir(schemasDir))
    .filter((file) => file.endsWith(SCHEMA_FILE_EXTENSION))
    .sort();

  const inputs: unknown[] = [];
  for (const file of files) {
    const text = await readFile(join(schemasDir, file), UTF8);
    try {
      inputs.push(JSON.parse(text));
    } catch {
      throw new ContentEngineError(`${file}: not valid JSON`);
    }
  }

  const validation = validateDefinitions(inputs);
  if (!validation.ok) {
    const lines = validation.errors.map((error) => {
      const [index, ...path] = error.path;
      const file = typeof index === 'number' ? files[index] : undefined;
      return `${file ?? '?'} ${formatDefinitionPath(path)} [${error.rule}] ${error.message}`;
    });
    throw new ContentEngineError(
      `Invalid content type definitions:\n- ${lines.join('\n- ')}`,
    );
  }

  const definitions = validation.definitions.map((entry) => entry.definition);
  definitions.forEach((definition, index) => {
    const expected = `${definition.slug}${SCHEMA_FILE_EXTENSION}`;
    if (files[index] !== expected) {
      throw new ContentEngineError(
        `${files[index]}: slug "${definition.slug}" must live in ${expected}`,
      );
    }
  });
  return definitions;
}

/** Ordered migrations in `migrationsDir` (missing dir = none). */
export async function listMigrations(
  migrationsDir: string,
): Promise<MigrationFile[]> {
  let entries: string[];
  try {
    entries = await readdir(migrationsDir);
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }

  const migrations: MigrationFile[] = [];
  for (const name of entries) {
    const match = MIGRATION_FILE_PATTERN.exec(name);
    if (match === null) continue;
    const sql = await readFile(join(migrationsDir, name), UTF8);
    migrations.push({
      name,
      sequence: Number(match[1]),
      sql,
      checksum: checksumOf(sql),
    });
  }
  migrations.sort((a, b) => a.sequence - b.sequence);

  for (let index = 1; index < migrations.length; index += 1) {
    const current = migrations[index];
    const previous = migrations[index - 1];
    if (current && previous && current.sequence === previous.sequence) {
      throw new ContentEngineError(
        `Two migrations share sequence ${current.sequence}: ${previous.name}, ${current.name}`,
      );
    }
  }
  return migrations;
}

export function migrationFileName(sequence: number, label: string): string {
  return `${String(sequence).padStart(MIGRATION_SEQUENCE_DIGITS, '0')}_${label}.sql`;
}

const snapshotSchema = z.strictObject({
  formatVersion: z.literal(SNAPSHOT_FORMAT_VERSION),
  contentTypes: z.record(
    z.string(),
    z.strictObject({ hash: z.string(), definition: z.unknown() }),
  ),
});

/**
 * Reads `snapshot.json` and re-validates every definition in it, so a
 * hand-edited snapshot can never inject an unchecked name into DDL.
 */
export async function readSnapshot(
  migrationsDir: string,
): Promise<DefinitionSnapshot> {
  let text: string;
  try {
    text = await readFile(join(migrationsDir, MIGRATION_SNAPSHOT_FILE), UTF8);
  } catch (error) {
    if (isMissing(error)) return emptySnapshot();
    throw error;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ContentEngineError(`${MIGRATION_SNAPSHOT_FILE}: not valid JSON`);
  }
  const parsed = snapshotSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ContentEngineError(`${MIGRATION_SNAPSHOT_FILE}: invalid format`);
  }
  const slugs = Object.keys(parsed.data.contentTypes);
  const validation = validateDefinitions(
    slugs.map((slug) => parsed.data.contentTypes[slug]?.definition),
  );
  if (!validation.ok) {
    throw new ContentEngineError(
      `${MIGRATION_SNAPSHOT_FILE}: contains an invalid definition`,
    );
  }

  const snapshot = emptySnapshot();
  validation.definitions.forEach(({ definition }, index) => {
    const key = slugs[index];
    const stored =
      key === undefined ? undefined : parsed.data.contentTypes[key];
    if (
      key !== definition.slug ||
      stored?.hash !== hashDefinition(definition)
    ) {
      throw new ContentEngineError(
        `${MIGRATION_SNAPSHOT_FILE}: entry "${key}" does not match its definition`,
      );
    }
    snapshot.contentTypes[key] = { hash: stored.hash, definition };
  });
  return snapshot;
}

export async function writeMigration(
  migrationsDir: string,
  name: string,
  sql: string,
  snapshot: DefinitionSnapshot,
): Promise<void> {
  await mkdir(migrationsDir, { recursive: true });
  await writeFile(join(migrationsDir, name), sql, {
    encoding: UTF8,
    flag: 'wx',
  });
  await writeFile(
    join(migrationsDir, MIGRATION_SNAPSHOT_FILE),
    `${JSON.stringify(snapshot, null, 2)}\n`,
    UTF8,
  );
}
