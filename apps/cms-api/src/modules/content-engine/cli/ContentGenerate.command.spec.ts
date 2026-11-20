import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DEFAULT_CONTENT_PATHS } from '../adapters/MigrationFiles.adapter';
import { ContentEngineError } from '../domain/ContentDocument.entity';
import {
  checkContentMigrations,
  DestructiveChangeError,
  generateContentMigration,
  type GenerateOptions,
} from './ContentGenerate.command';

const PAGE_CV_A_FILE = 'page-cv-a.json';

describe('content:generate --check', () => {
  let root: string;
  let options: GenerateOptions;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'abyss-check-'));
    const schemasDir = join(root, 'schemas');
    await mkdir(schemasDir);
    await copyFile(
      join(DEFAULT_CONTENT_PATHS.schemasDir, PAGE_CV_A_FILE),
      join(schemasDir, PAGE_CV_A_FILE),
    );
    options = {
      schemasDir,
      migrationsDir: join(root, 'migrations'),
      label: 'test',
      allowDestructive: false,
      dryRun: false,
    };
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('fails with a clear message when a migration is missing, and writes nothing', async () => {
    const failure = checkContentMigrations(options);
    await expect(failure).rejects.toBeInstanceOf(ContentEngineError);
    await expect(failure).rejects.toThrow(/without a migration/);
    await expect(readdir(options.migrationsDir)).rejects.toThrow(/ENOENT/);
  });

  it('passes once the migration is generated', async () => {
    await generateContentMigration(options);
    await expect(checkContentMigrations(options)).resolves.toEqual({
      status: 'no-changes',
    });
  });
});

describe('content:generate --data-step', () => {
  let root: string;
  let options: GenerateOptions;
  let dataStepFile: string;
  const POST_V1 = {
    slug: 'post',
    displayName: 'Post',
    kind: 'collection',
    draftAndPublish: false,
    fields: [
      { name: 'title', type: 'string' },
      { name: 'body', type: 'string' },
    ],
  };
  const POST_V2 = {
    ...POST_V1,
    fields: [
      { name: 'title', type: 'string' },
      { name: 'summary', type: 'string' },
    ],
  };

  async function writeDefinition(definition: object): Promise<void> {
    await writeFile(join(options.schemasDir, 'post.json'), JSON.stringify(definition));
  }

  async function writeDataStep(lines: string[]): Promise<void> {
    await writeFile(dataStepFile, lines.join('\n'));
  }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'abyss-datastep-'));
    const schemasDir = join(root, 'schemas');
    await mkdir(schemasDir);
    dataStepFile = join(root, 'step.sql');
    options = {
      schemasDir,
      migrationsDir: join(root, 'migrations'),
      label: 'test',
      allowDestructive: false,
      dryRun: false,
    };
    await writeDefinition(POST_V1);
    await generateContentMigration(options);
    await writeDefinition(POST_V2);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function migrationFiles(): Promise<string[]> {
    return (await readdir(options.migrationsDir)).filter((name) => name.endsWith('.sql'));
  }

  it('refuses without a data step and lists the change', async () => {
    const failure = generateContentMigration(options);
    await expect(failure).rejects.toBeInstanceOf(DestructiveChangeError);
    await expect(failure).rejects.toThrow(/--data-step/);
    expect(await migrationFiles()).toHaveLength(1);
  });

  it('refuses and lists only the undeclared changes', async () => {
    await writeDefinition({ ...POST_V2, fields: [{ name: 'summary', type: 'string' }] });
    await writeDataStep([
      '-- carries post.body',
      'UPDATE "content"."post" SET "summary" = "body";',
    ]);
    const failure = generateContentMigration({ ...options, dataStepFile });
    await expect(failure).rejects.toThrow(/post\.title/);
    await expect(failure).rejects.not.toThrow(/post\.body/);
    expect(await migrationFiles()).toHaveLength(1);
  });

  it('writes without --allow-destructive when the data step declares every change', async () => {
    await writeDataStep([
      '-- carries post.body',
      'UPDATE "content"."post" SET "summary" = "body";',
    ]);
    const result = await generateContentMigration({ ...options, dataStepFile });
    expect(result.status).toBe('written');
    const sql = await readFile(join(options.migrationsDir, '0002_test.sql'), 'utf8');
    expect(sql.indexOf('ADD COLUMN "summary"')).toBeLessThan(sql.indexOf('-- Data step (begin)'));
    expect(sql.indexOf('-- Data step (end)')).toBeLessThan(sql.indexOf('DROP COLUMN "body"'));
  });

  it('still writes with --allow-destructive alone', async () => {
    const result = await generateContentMigration({ ...options, allowDestructive: true });
    expect(result.status).toBe('written');
  });

  it('prints the full file with the data step on a dry run and on --check', async () => {
    await writeDataStep([
      '-- carries post.body',
      'UPDATE "content"."post" SET "summary" = "body";',
    ]);
    const dry = await generateContentMigration({ ...options, dataStepFile, dryRun: true });
    expect(dry).toMatchObject({ status: 'dry-run' });
    expect(dry.status === 'dry-run' && dry.sql).toContain('-- Data step (begin)');
    expect(await migrationFiles()).toHaveLength(1);
    await expect(checkContentMigrations({ ...options, dataStepFile })).rejects.toThrow(/Data step/);
  });

  it('refuses a declaration that matches no change and a data step on an unchanged plan', async () => {
    await writeDataStep(['-- carries post.nothing', 'SELECT 1;']);
    await expect(generateContentMigration({ ...options, dataStepFile })).rejects.toThrow(
      /matches no destructive change/,
    );
    await generateContentMigration({ ...options, allowDestructive: true });
    await expect(generateContentMigration({ ...options, dataStepFile })).rejects.toThrow(
      /no change/,
    );
  });
});
