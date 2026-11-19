import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

import {
  DEFAULT_MIGRATION_LABEL,
  MIGRATION_LABEL_PATTERN,
} from '../adapters/ContentDatabase.adapter';
import {
  DEFAULT_CONTENT_PATHS,
  listMigrations,
  loadDefinitions,
  migrationFileName,
  readSnapshot,
  writeMigration,
} from '../adapters/MigrationFiles.adapter';
import { ContentEngineError } from '../domain/ContentDocument.entity';
import {
  assertDeclarationsMatchPlan,
  parseDataStep,
  undeclaredDestructiveChanges,
  type DataStep,
} from '../domain/DataStep.rules';
import {
  planMigration,
  renderMigrationSql,
  type DestructiveChange,
  type MigrationPlan,
} from '../domain/SqlGenerator.rules';

export interface GenerateOptions {
  schemasDir: string;
  migrationsDir: string;
  /** File label: `0002_<label>.sql`. */
  label: string;
  allowDestructive: boolean;
  /** Print the SQL and the destructive changes; write nothing. */
  dryRun: boolean;
  /** SQL file moving data before the destructive statements (`--data-step`). */
  dataStepFile?: string;
}

export type GenerateResult =
  | { status: 'no-changes' }
  | { status: 'dry-run'; fileName: string; sql: string; plan: MigrationPlan }
  | { status: 'written'; fileName: string; sql: string; plan: MigrationPlan };

export class DestructiveChangeError extends ContentEngineError {
  constructor(readonly changes: readonly DestructiveChange[]) {
    super(
      `Refusing to generate a destructive migration (data can be lost):\n- ${describe(changes)}\nCarry or discard each change in a data step (--data-step <file>), or for test data only re-run with --allow-destructive.`,
    );
    this.name = 'DestructiveChangeError';
  }
}

/** Diffs `schemasDir` against the snapshot of the last migration and writes the next one. */
export async function generateContentMigration(options: GenerateOptions): Promise<GenerateResult> {
  if (!MIGRATION_LABEL_PATTERN.test(options.label)) {
    throw new ContentEngineError(
      `Migration name "${options.label}" must match ${MIGRATION_LABEL_PATTERN.source}`,
    );
  }

  const definitions = await loadDefinitions(options.schemasDir);
  const previous = await readSnapshot(options.migrationsDir);
  const plan = planMigration(previous, definitions);
  if (plan.changedSlugs.length === 0) {
    if (options.dataStepFile !== undefined) {
      throw new ContentEngineError('--data-step given, but the content types have no change.');
    }
    return { status: 'no-changes' };
  }

  const existing = await listMigrations(options.migrationsDir);
  const sequence = (existing.at(-1)?.sequence ?? 0) + 1;
  const fileName = migrationFileName(sequence, options.label);
  const dataStep = await readDataStep(options.dataStepFile, plan);
  const sql = renderMigrationSql(plan, dataStep);

  if (options.dryRun) return { status: 'dry-run', fileName, sql, plan };
  const undeclared = dataStep
    ? undeclaredDestructiveChanges(plan, dataStep)
    : plan.destructiveChanges;
  if (undeclared.length > 0 && !options.allowDestructive) {
    throw new DestructiveChangeError(undeclared);
  }

  await writeMigration(options.migrationsDir, fileName, sql, plan.nextSnapshot);
  return { status: 'written', fileName, sql, plan };
}

async function readDataStep(
  dataStepFile: string | undefined,
  plan: MigrationPlan,
): Promise<DataStep | undefined> {
  if (dataStepFile === undefined) return undefined;
  const dataStep = parseDataStep(await readFile(dataStepFile, 'utf8'));
  assertDeclarationsMatchPlan(plan, dataStep);
  return dataStep;
}

function describe(changes: readonly DestructiveChange[]): string {
  return changes.map(({ description }) => description).join('\n- ');
}

/**
 * `--check`: a dry run that fails when the committed migrations are behind the
 * schemas (CI uses it so a schema change cannot land without its migration).
 */
export async function checkContentMigrations(options: GenerateOptions): Promise<GenerateResult> {
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
          ? `\nDestructive changes (declare each in a data step, or --allow-destructive for test data):\n- ${describe(result.plan.destructiveChanges)}\n`
          : '';
      return `Dry run, would write ${result.fileName}:\n\n${result.sql}${warning}`;
    }
    case 'written':
      return `Wrote ${result.fileName} (${result.plan.statements.length + result.plan.destructiveStatements.length} statements).`;
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
      'data-step': { type: 'string' },
    },
  });
  const options: GenerateOptions = {
    ...DEFAULT_CONTENT_PATHS,
    label: values.name,
    allowDestructive: values['allow-destructive'],
    dryRun: values['dry-run'],
    ...(values['data-step'] === undefined ? {} : { dataStepFile: values['data-step'] }),
  };
  const result = values.check
    ? await checkContentMigrations(options)
    : await generateContentMigration(options);
  process.stdout.write(`${report(result)}\n`);
}

if (require.main === module) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
