import { copyFile, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ContentEngineError } from '../domain/ContentDocument.entity';
import { DEFAULT_CONTENT_PATHS } from '../adapters/MigrationFiles.adapter';
import {
  checkContentMigrations,
  type GenerateOptions,
  generateContentMigration,
} from './ContentGenerate.command';

const CV_PAGE_FILE = 'cv-page.json';

describe('content:generate --check', () => {
  let root: string;
  let options: GenerateOptions;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'abyss-check-'));
    const schemasDir = join(root, 'schemas');
    await mkdir(schemasDir);
    await copyFile(
      join(DEFAULT_CONTENT_PATHS.schemasDir, CV_PAGE_FILE),
      join(schemasDir, CV_PAGE_FILE),
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
