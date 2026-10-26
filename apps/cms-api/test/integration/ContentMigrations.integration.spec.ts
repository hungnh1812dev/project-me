import { randomUUID } from 'node:crypto';
import {
  appendFile,
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Client } from 'pg';

import {
  DestructiveChangeError,
  generateContentMigration,
  type GenerateOptions,
} from '../../src/modules/content-engine/cli/ContentGenerate.command';
import { DEFAULT_CONTENT_PATHS } from '../../src/modules/content-engine/adapters/MigrationFiles.adapter';
import { createMigrationDb } from '../../src/modules/content-engine/cli/ContentEngineCli.setup';
import { runContentMigrations } from '../../src/modules/content-engine/adapters/MigrationRunner.adapter';
import { startPostgres, type TestPostgres } from '../fixtures/Postgres.fixture';

const CV_PAGE_FILE = 'cv-page.json';

interface Workspace {
  schemasDir: string;
  migrationsDir: string;
  databaseUrl: string;
}

describe('content:generate + content:migrate (Postgres 16 via Testcontainers)', () => {
  let postgres: TestPostgres;
  const cleanup: string[] = [];

  beforeAll(async () => {
    postgres = await startPostgres();
  });

  afterAll(async () => {
    await Promise.all(
      cleanup.map((dir) => rm(dir, { recursive: true, force: true })),
    );
    await postgres?.stop();
  });

  async function query<T extends object>(
    databaseUrl: string,
    text: string,
    values: unknown[] = [],
  ): Promise<T[]> {
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      return (await client.query<T>(text, values)).rows;
    } finally {
      await client.end();
    }
  }

  /** Fresh database + temp folders holding a copy of cv-page.json. */
  async function workspace(): Promise<Workspace> {
    const root = await mkdtemp(join(tmpdir(), 'abyss-content-'));
    cleanup.push(root);
    const schemasDir = join(root, 'schemas');
    await mkdir(schemasDir);
    await copyFile(
      join(DEFAULT_CONTENT_PATHS.schemasDir, CV_PAGE_FILE),
      join(schemasDir, CV_PAGE_FILE),
    );

    const database = `t_${randomUUID().replace(/-/g, '')}`;
    await query(postgres.getConnectionUri(), `CREATE DATABASE "${database}"`);
    const url = new URL(postgres.getConnectionUri());
    url.pathname = `/${database}`;
    return {
      schemasDir,
      migrationsDir: join(root, 'migrations'),
      databaseUrl: url.toString(),
    };
  }

  function generate(ws: Workspace, overrides: Partial<GenerateOptions> = {}) {
    return generateContentMigration({
      schemasDir: ws.schemasDir,
      migrationsDir: ws.migrationsDir,
      label: 'test',
      allowDestructive: false,
      dryRun: false,
      ...overrides,
    });
  }

  async function migrate(ws: Workspace) {
    const db = createMigrationDb(ws.databaseUrl);
    try {
      return await runContentMigrations(db, ws.migrationsDir);
    } finally {
      await db.destroy();
    }
  }

  async function contentTables(ws: Workspace): Promise<string[]> {
    const rows = await query<{ table_name: string }>(
      ws.databaseUrl,
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'content' AND table_name NOT LIKE '\\_%'
       ORDER BY table_name`,
    );
    return rows.map((row) => row.table_name);
  }

  async function columns(ws: Workspace, table: string) {
    return query<{ column_name: string; data_type: string }>(
      ws.databaseUrl,
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_schema = 'content' AND table_name = $1`,
      [table],
    );
  }

  async function editCvPage(
    ws: Workspace,
    edit: (definition: { fields: Record<string, unknown>[] }) => void,
  ): Promise<void> {
    const file = join(ws.schemasDir, CV_PAGE_FILE);
    const definition = JSON.parse(await readFile(file, 'utf8')) as {
      fields: Record<string, unknown>[];
    };
    edit(definition);
    await writeFile(file, JSON.stringify(definition));
  }

  it('cv-page produces exactly the 8 tables of SPEC §8.2 (§12-16)', async () => {
    const ws = await workspace();
    expect(await generate(ws)).toMatchObject({
      status: 'written',
      fileName: '0001_test.sql',
    });
    expect(await migrate(ws)).toEqual({
      applied: ['0001_test.sql'],
      upserted: ['cv-page'],
      removed: [],
    });

    expect(await contentTables(ws)).toEqual([
      'cv_page',
      'cv_page__education',
      'cv_page__experience',
      'cv_page__experience__role',
      'cv_page__language',
      'cv_page__project',
      'cv_page__reference',
      'cv_page__skill',
    ]);

    const [row] = await query<{
      slug: string;
      kind: string;
      draft_and_publish: boolean;
      definition_hash: string;
    }>(
      ws.databaseUrl,
      'SELECT slug, kind, draft_and_publish, definition_hash FROM content._content_types',
    );
    const snapshot = JSON.parse(
      await readFile(join(ws.migrationsDir, 'snapshot.json'), 'utf8'),
    ) as { contentTypes: Record<string, { hash: string }> };
    expect(row).toEqual({
      slug: 'cv-page',
      kind: 'collection',
      draft_and_publish: true,
      definition_hash: snapshot.contentTypes['cv-page']?.hash,
    });
  });

  it('enforces the draft/published partial unique indexes and cascades components', async () => {
    const ws = await workspace();
    await generate(ws);
    await migrate(ws);
    const documentId = randomUUID();
    const insertRoot = `INSERT INTO content.cv_page (document_id, published_at) VALUES ($1, $2) RETURNING id`;

    const [draft] = await query<{ id: number }>(ws.databaseUrl, insertRoot, [
      documentId,
      null,
    ]);
    await query(ws.databaseUrl, insertRoot, [documentId, new Date()]);
    await expect(
      query(ws.databaseUrl, insertRoot, [documentId, null]),
    ).rejects.toThrow(/cv_page_draft_uq/);
    await expect(
      query(ws.databaseUrl, insertRoot, [documentId, new Date()]),
    ).rejects.toThrow(/cv_page_published_uq/);

    const [experience] = await query<{ id: number }>(
      ws.databaseUrl,
      `INSERT INTO content.cv_page__experience (component_uid, parent_id) VALUES ($1, $2) RETURNING id`,
      [randomUUID(), draft?.id],
    );
    await query(
      ws.databaseUrl,
      `INSERT INTO content.cv_page__experience__role (component_uid, parent_id) VALUES ($1, $2)`,
      [randomUUID(), experience?.id],
    );
    await query(ws.databaseUrl, 'DELETE FROM content.cv_page WHERE id = $1', [
      draft?.id,
    ]);
    const [left] = await query<{ count: string }>(
      ws.databaseUrl,
      'SELECT count(*) FROM content.cv_page__experience__role',
    );
    expect(left?.count).toBe('0');
  });

  it('is a no-op when generate and migrate run again', async () => {
    const ws = await workspace();
    await generate(ws);
    await migrate(ws);
    const tablesBefore = await contentTables(ws);

    expect(await generate(ws)).toEqual({ status: 'no-changes' });
    expect(await readdir(ws.migrationsDir)).toEqual([
      '0001_test.sql',
      'snapshot.json',
    ]);
    expect(await migrate(ws)).toEqual({
      applied: [],
      upserted: [],
      removed: [],
    });
    expect(await contentTables(ws)).toEqual(tablesBefore);
  });

  it('adds a field additively without the flag', async () => {
    const ws = await workspace();
    await generate(ws);
    await migrate(ws);
    await editCvPage(ws, (definition) => {
      definition.fields.push({ name: 'githubUrl', type: 'string' });
    });

    expect(await generate(ws)).toMatchObject({
      status: 'written',
      fileName: '0002_test.sql',
    });
    expect(await migrate(ws)).toMatchObject({
      applied: ['0002_test.sql'],
      upserted: ['cv-page'],
    });
    expect(await columns(ws, 'cv_page')).toContainEqual({
      column_name: 'github_url',
      data_type: 'text',
    });
  });

  it('refuses a dropped field without --allow-destructive, applies it with', async () => {
    const ws = await workspace();
    await generate(ws);
    await migrate(ws);
    await editCvPage(ws, (definition) => {
      definition.fields = definition.fields.filter(
        (field) => field.name !== 'summary',
      );
    });

    const refused = generate(ws);
    await expect(refused).rejects.toBeInstanceOf(DestructiveChangeError);
    await expect(refused).rejects.toThrow(/Drop column cv_page\.summary/);
    await expect(refused).rejects.toThrow(/--allow-destructive/);
    expect(await readdir(ws.migrationsDir)).toEqual([
      '0001_test.sql',
      'snapshot.json',
    ]);

    const dryRun = await generate(ws, { dryRun: true });
    expect(dryRun).toMatchObject({ status: 'dry-run' });
    expect(await readdir(ws.migrationsDir)).toHaveLength(2);

    expect(await generate(ws, { allowDestructive: true })).toMatchObject({
      status: 'written',
    });
    await migrate(ws);
    const names = (await columns(ws, 'cv_page')).map((c) => c.column_name);
    expect(names).not.toContain('summary');
  });

  it('refuses a type change without the flag, casts existing data with it', async () => {
    const ws = await workspace();
    await generate(ws);
    await migrate(ws);
    await query(
      ws.databaseUrl,
      `INSERT INTO content.cv_page (document_id, is_main) VALUES ($1, true)`,
      [randomUUID()],
    );
    await editCvPage(ws, (definition) => {
      const isMain = definition.fields.find((field) => field.name === 'isMain');
      if (isMain) isMain.type = 'string';
    });

    await expect(generate(ws)).rejects.toThrow(
      /Change type of cv_page\.is_main from boolean to text/,
    );
    await generate(ws, { allowDestructive: true });
    await migrate(ws);
    expect(await columns(ws, 'cv_page')).toContainEqual({
      column_name: 'is_main',
      data_type: 'text',
    });
    const [row] = await query<{ is_main: string }>(
      ws.databaseUrl,
      'SELECT is_main FROM content.cv_page',
    );
    expect(row?.is_main).toBe('true');
  });

  it('serialises concurrent migrate runs with the advisory lock', async () => {
    const ws = await workspace();
    await generate(ws);

    const results = await Promise.all([migrate(ws), migrate(ws), migrate(ws)]);
    const applied = results.flatMap((result) => result.applied);
    expect(applied).toEqual(['0001_test.sql']);
    expect(await contentTables(ws)).toHaveLength(8);
    const rows = await query(
      ws.databaseUrl,
      'SELECT name FROM content._migrations',
    );
    expect(rows).toHaveLength(1);
  });

  it('refuses to run when an applied migration was edited', async () => {
    const ws = await workspace();
    await generate(ws);
    await migrate(ws);
    await appendFile(join(ws.migrationsDir, '0001_test.sql'), '-- edited\n');

    await expect(migrate(ws)).rejects.toThrow(/checksum mismatch/);
  });

  it('rolls back everything when a migration fails', async () => {
    const ws = await workspace();
    await generate(ws);
    await writeFile(
      join(ws.migrationsDir, '0002_broken.sql'),
      'SELECT * FROM content.does_not_exist;\n',
    );

    await expect(migrate(ws)).rejects.toThrow(/does_not_exist/);
    const [schema] = await query<{ count: string }>(
      ws.databaseUrl,
      `SELECT count(*) FROM information_schema.schemata WHERE schema_name = 'content'`,
    );
    expect(schema?.count).toBe('0');
  });
});
