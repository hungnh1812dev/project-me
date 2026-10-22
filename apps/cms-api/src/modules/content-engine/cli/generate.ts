import { parseArgs } from 'node:util';

import {
  DEFAULT_MIGRATION_LABEL,
  MIGRATION_LABEL_PATTERN,
} from '../content-engine.constants';
import {
  ContentEngineError,
  listMigrations,
  loadDefinitions,
  migrationFileName,
  readSnapshot,
  writeMigration,
} from '../migration-files';
import {
  type MigrationPlan,
  planMigration,
  renderMigrationSql,
} from '../sql-generator';
import { DEFAULT_CONTENT_PATHS } from './content-paths';

export interface GenerateOptions {
  schemasDir: string;
  migrationsDir: string;
  /** File label: `0002_<label>.sql`. */
  label: string;
  allowDestructive: boolean;
  /** Print the SQL and the destructive changes; write nothing. */
  dryRun: boolean;
}

export type GenerateResult =
  | { status: 'no-changes' }
  | { status: 'dry-run'; fileName: string; sql: string; plan: MigrationPlan }
  | { status: 'written'; fileName: string; sql: string; plan: MigrationPlan };

export class DestructiveChangeError extends ContentEngineError {
  constructor(readonly changes: readonly string[]) {
    super(
      `Refusing to generate a destructive migration (data can be lost):\n- ${changes.join('\n- ')}\nReview the change, then re-run with --allow-destructive.`,
    );
    this.name = 'DestructiveChangeError';
  }
}

/** Diffs `schemasDir` against the snapshot of the last migration and writes the next one. */
export async function generateContentMigration(
  options: GenerateOptions,
): Promise<GenerateResult> {
  if (!MIGRATION_LABEL_PATTERN.test(options.label)) {
    throw new ContentEngineError(
      `Migration name "${options.label}" must match ${MIGRATION_LABEL_PATTERN.source}`,
    );
  }

  const definitions = await loadDefinitions(options.schemasDir);
  const previous = await readSnapshot(options.migrationsDir);
  const plan = planMigration(previous, definitions);
  if (plan.changedSlugs.length === 0) return { status: 'no-changes' };

  const existing = await listMigrations(options.migrationsDir);
  const sequence = (existing.at(-1)?.sequence ?? 0) + 1;
  const fileName = migrationFileName(sequence, options.label);
  const sql = renderMigrationSql(plan);

  if (options.dryRun) return { status: 'dry-run', fileName, sql, plan };
  if (plan.destructiveChanges.length > 0 && !options.allowDestructive) {
    throw new DestructiveChangeError(plan.destructiveChanges);
  }

  await writeMigration(options.migrationsDir, fileName, sql, plan.nextSnapshot);
  return { status: 'written', fileName, sql, plan };
}

/**
 * `--check`: a dry run that fails when the committed migrations are behind the
 * schemas (CI uses it so a schema change cannot land without its migration).
 */
export async function checkContentMigrations(
  options: GenerateOptions,
): Promise<GenerateResult> {
  const result = await generateContentMigration({ ...options, dryRun: true });
  if (result.status !== 'no-changes') {
    throw new ContentEngineError(
      `Content types changed without a migration. Run content:generate and commit the result.\n${report(result)}`,
    );
  }
  return result;
}

function report(result: GenerateResult): string {
  switch (result.status) {
    case 'no-changes':
      return 'No content type changes: nothing to generate.';
    case 'dry-run': {
      const warning =
        result.plan.destructiveChanges.length > 0
          ? `\nDestructive changes (need --allow-destructive):\n- ${result.plan.destructiveChanges.join('\n- ')}\n`
          : '';
      return `Dry run, would write ${result.fileName}:\n\n${result.sql}${warning}`;
    }
    case 'written':
      return `Wrote ${result.fileName} (${result.plan.statements.length} statements).`;
  }
}

async function main(): Promise<void> {
  // `pnpm content:generate -- --dry-run` forwards the `--` separator.
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  const { values } = parseArgs({
    args,
    options: {
      name: { type: 'string', default: DEFAULT_MIGRATION_LABEL },
      'allow-destructive': { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      check: { type: 'boolean', default: false },
    },
  });
  const options: GenerateOptions = {
    ...DEFAULT_CONTENT_PATHS,
    label: values.name,
    allowDestructive: values['allow-destructive'],
    dryRun: values['dry-run'],
  };
  const result = values.check
    ? await checkContentMigrations(options)
    : await generateContentMigration(options);
  process.stdout.write(`${report(result)}\n`);
}

if (require.main === module) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
