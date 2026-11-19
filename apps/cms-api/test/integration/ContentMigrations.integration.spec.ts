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

import { DEFAULT_CONTENT_PATHS } from '../../src/modules/content-engine/adapters/MigrationFiles.adapter';
import { runContentMigrations } from '../../src/modules/content-engine/adapters/MigrationRunner.adapter';
import { createMigrationDb } from '../../src/modules/content-engine/cli/ContentEngineCli.setup';
import {
  DestructiveChangeError,
  generateContentMigration,
  type GenerateOptions,
} from '../../src/modules/content-engine/cli/ContentGenerate.command';
import { startPostgres, type TestPostgres } from '../fixtures/Postgres.fixture';

const PAGE_CV_A_FILE = 'page-cv-a.json';

interface Workspace {
  schemasDir: string;
  migrationsDir: string;
  databaseUrl: string;
}

describe('content:generate + content:migrate (Postgres 17 via Testcontainers)', () => {
  let postgres: TestPostgres;
  const cleanup: string[] = [];

  beforeAll(async () => {
    postgres = await startPostgres();
  });

  afterAll(async () => {
    await Promise.all(cleanup.map((dir) => rm(dir, { recursive: true, force: true })));
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

  /** Fresh database + temp folders holding a copy of page-cv-a.json. */
  async function workspace(): Promise<Workspace> {
    const root = await mkdtemp(join(tmpdir(), 'abyss-content-'));
    cleanup.push(root);
    const schemasDir = join(root, 'schemas');
    await mkdir(schemasDir);
    await copyFile(
      join(DEFAULT_CONTENT_PATHS.schemasDir, PAGE_CV_A_FILE),
      join(schemasDir, PAGE_CV_A_FILE),
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

  async function editPageCvA(
    ws: Workspace,
    edit: (definition: { fields: Record<string, unknown>[] }) => void,
  ): Promise<void> {
    const file = join(ws.schemasDir, PAGE_CV_A_FILE);
    const definition = JSON.parse(await readFile(file, 'utf8')) as {
      fields: Record<string, unknown>[];
    };
    edit(definition);
    await writeFile(file, JSON.stringify(definition));
  }

  it('page-cv-a produces exactly its 6 tables (criterion 16)', async () => {
    const ws = await workspace();
    expect(await generate(ws)).toMatchObject({
      status: 'written',
      fileName: '0001_test.sql',
    });
    expect(await migrate(ws)).toEqual({
      applied: ['0001_test.sql'],
      upserted: ['page-cv-a'],
      removed: [],
    });

    expect(await contentTables(ws)).toEqual([
      'page_cv_a',
      'page_cv_a__education',
      'page_cv_a__experience',
      'page_cv_a__experience__role',
      'page_cv_a__project',
      'page_cv_a__skill',
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
      slug: 'page-cv-a',
      kind: 'collection',
      draft_and_publish: true,
      definition_hash: snapshot.contentTypes['page-cv-a']?.hash,
    });
  });

  it('enforces the draft/published partial unique indexes and cascades components', async () => {
    const ws = await workspace();
    await generate(ws);
    await migrate(ws);
    const documentId = randomUUID();
    const insertRoot = `INSERT INTO content.page_cv_a (document_id, published_at) VALUES ($1, $2) RETURNING id`;

    const [draft] = await query<{ id: number }>(ws.databaseUrl, insertRoot, [documentId, null]);
    await query(ws.databaseUrl, insertRoot, [documentId, new Date()]);
    await expect(query(ws.databaseUrl, insertRoot, [documentId, null])).rejects.toThrow(
      /page_cv_a_draft_uq/,
    );
    await expect(query(ws.databaseUrl, insertRoot, [documentId, new Date()])).rejects.toThrow(
      /page_cv_a_published_uq/,
    );

    const [experience] = await query<{ id: number }>(
      ws.databaseUrl,
      `INSERT INTO content.page_cv_a__experience (component_uid, parent_id) VALUES ($1, $2) RETURNING id`,
      [randomUUID(), draft?.id],
    );
    await query(
      ws.databaseUrl,
      `INSERT INTO content.page_cv_a__experience__role (component_uid, parent_id) VALUES ($1, $2)`,
      [randomUUID(), experience?.id],
    );
    await query(ws.databaseUrl, 'DELETE FROM content.page_cv_a WHERE id = $1', [draft?.id]);
    const [left] = await query<{ count: string }>(
      ws.databaseUrl,
      'SELECT count(*) FROM content.page_cv_a__experience__role',
    );
    expect(left?.count).toBe('0');
  });

  it('is a no-op when generate and migrate run again', async () => {
    const ws = await workspace();
    await generate(ws);
    await migrate(ws);
    const tablesBefore = await contentTables(ws);

    expect(await generate(ws)).toEqual({ status: 'no-changes' });
    expect(await readdir(ws.migrationsDir)).toEqual(['0001_test.sql', 'snapshot.json']);
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
    await editPageCvA(ws, (definition) => {
      definition.fields.push({ name: 'githubUrl', type: 'string' });
    });

    expect(await generate(ws)).toMatchObject({
      status: 'written',
      fileName: '0002_test.sql',
    });
    expect(await migrate(ws)).toMatchObject({
      applied: ['0002_test.sql'],
      upserted: ['page-cv-a'],
    });
    expect(await columns(ws, 'page_cv_a')).toContainEqual({
      column_name: 'github_url',
      data_type: 'text',
    });
  });

  it('stores a changed displayName without running DDL', async () => {
    const ws = await workspace();
    await generate(ws);
    await migrate(ws);
    const tablesBefore = await contentTables(ws);
    const file = join(ws.schemasDir, PAGE_CV_A_FILE);
    const definition = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
    await writeFile(file, JSON.stringify({ ...definition, displayName: 'Renamed Page CV' }));

    expect(await generate(ws)).toMatchObject({ status: 'written', fileName: '0002_test.sql' });
    const migration = await readFile(join(ws.migrationsDir, '0002_test.sql'), 'utf8');
    expect(migration).toContain('Definition metadata only: no DDL needed.');
    expect(await migrate(ws)).toMatchObject({
      applied: ['0002_test.sql'],
      upserted: ['page-cv-a'],
    });

    expect(await contentTables(ws)).toEqual(tablesBefore);
    const [row] = await query<{ definition: { displayName: string } }>(
      ws.databaseUrl,
      'SELECT definition FROM content._content_types',
    );
    expect(row?.definition.displayName).toBe('Renamed Page CV');
  });

  it('refuses a dropped field without --allow-destructive, applies it with', async () => {
    const ws = await workspace();
    await generate(ws);
    await migrate(ws);
    await editPageCvA(ws, (definition) => {
      definition.fields = definition.fields.filter((field) => field.name !== 'summary');
    });

    const refused = generate(ws);
    await expect(refused).rejects.toBeInstanceOf(DestructiveChangeError);
    await expect(refused).rejects.toThrow(/Drop column page_cv_a\.summary/);
    await expect(refused).rejects.toThrow(/--allow-destructive/);
    expect(await readdir(ws.migrationsDir)).toEqual(['0001_test.sql', 'snapshot.json']);

    const dryRun = await generate(ws, { dryRun: true });
    expect(dryRun).toMatchObject({ status: 'dry-run' });
    expect(await readdir(ws.migrationsDir)).toHaveLength(2);

    expect(await generate(ws, { allowDestructive: true })).toMatchObject({
      status: 'written',
    });
    await migrate(ws);
    const names = (await columns(ws, 'page_cv_a')).map((c) => c.column_name);
    expect(names).not.toContain('summary');
  });

  describe('data step', () => {
    async function renamePositionToJobTitle(ws: Workspace): Promise<void> {
      await generate(ws);
      await migrate(ws);
      await query(
        ws.databaseUrl,
        `INSERT INTO content.page_cv_a (document_id, position) VALUES ($1, 'Staff Engineer'), ($2, 'Lead')`,
        [randomUUID(), randomUUID()],
      );
      await editPageCvA(ws, (definition) => {
        const position = definition.fields.find((field) => field.name === 'position');
        if (position) position.name = 'jobTitle';
      });
    }

    async function appliedMigrations(ws: Workspace): Promise<string[]> {
      const rows = await query<{ name: string }>(
        ws.databaseUrl,
        'SELECT name FROM content._migrations ORDER BY name',
      );
      return rows.map((row) => row.name);
    }

    it('keeps the values of a renamed field without --allow-destructive', async () => {
      const ws = await workspace();
      await renamePositionToJobTitle(ws);
      const dataStepFile = join(ws.migrationsDir, '..', 'step.sql');
      await writeFile(
        dataStepFile,
        [
          '-- carries page_cv_a.position',
          'UPDATE content.page_cv_a SET job_title = position;',
        ].join('\n'),
      );

      await expect(generate(ws)).rejects.toBeInstanceOf(DestructiveChangeError);
      expect(await generate(ws, { dataStepFile })).toMatchObject({ status: 'written' });
      await migrate(ws);

      const rows = await query<{ job_title: string }>(
        ws.databaseUrl,
        'SELECT job_title FROM content.page_cv_a ORDER BY job_title',
      );
      expect(rows.map((row) => row.job_title)).toEqual(['Lead', 'Staff Engineer']);
      const names = (await columns(ws, 'page_cv_a')).map((c) => c.column_name);
      expect(names).not.toContain('position');
    });

    it('rolls back the whole run when the data step raises', async () => {
      const ws = await workspace();
      await renamePositionToJobTitle(ws);
      const dataStepFile = join(ws.migrationsDir, '..', 'step.sql');
      await writeFile(
        dataStepFile,
        [
          '-- carries page_cv_a.position',
          "DO $$ BEGIN RAISE EXCEPTION 'data step failed on purpose'; END $$;",
        ].join('\n'),
      );
      await generate(ws, { dataStepFile });

      await expect(migrate(ws)).rejects.toThrow(/data step failed on purpose/);

      const names = (await columns(ws, 'page_cv_a')).map((c) => c.column_name);
      expect(names).toContain('position');
      expect(names).not.toContain('job_title');
      expect(await appliedMigrations(ws)).toEqual(['0001_test.sql']);
    });
  });

  it('refuses a type change without the flag, casts existing data with it', async () => {
    const ws = await workspace();
    await generate(ws);
    await migrate(ws);
    await query(
      ws.databaseUrl,
      `INSERT INTO content.page_cv_a (document_id, is_main) VALUES ($1, true)`,
      [randomUUID()],
    );
    await editPageCvA(ws, (definition) => {
      const isMain = definition.fields.find((field) => field.name === 'isMain');
      if (isMain) isMain.type = 'string';
    });

    await expect(generate(ws)).rejects.toThrow(
      /Change type of page_cv_a\.is_main from boolean to text/,
    );
    await generate(ws, { allowDestructive: true });
    await migrate(ws);
    expect(await columns(ws, 'page_cv_a')).toContainEqual({
      column_name: 'is_main',
      data_type: 'text',
    });
    const [row] = await query<{ is_main: string }>(
      ws.databaseUrl,
      'SELECT is_main FROM content.page_cv_a',
    );
    expect(row?.is_main).toBe('true');
  });

  it('renames component tables with their rows, constraints and indexes', async () => {
    const ws = await workspace();
    await rm(join(ws.schemasDir, PAGE_CV_A_FILE));
    const definition = (parent: string, child: string) => ({
      slug: 'rename-demo',
      displayName: 'Rename demo',
      kind: 'collection',
      draftAndPublish: false,
      fields: [
        { name: 'title', type: 'text' },
        {
          name: 'parts',
          type: 'component',
          component: parent,
          repeatable: true,
          fields: [
            { name: 'label', type: 'text' },
            {
              name: 'items',
              type: 'component',
              component: child,
              repeatable: true,
              fields: [{ name: 'value', type: 'text' }],
            },
          ],
        },
      ],
    });
    const write = (parent: string, child: string) =>
      writeFile(join(ws.schemasDir, 'rename-demo.json'), JSON.stringify(definition(parent, child)));

    await write('parts', 'entries');
    await generate(ws);
    await migrate(ws);
    expect(await contentTables(ws)).toEqual([
      'rename_demo',
      'rename_demo__parts',
      'rename_demo__parts__entries',
    ]);

    const [root] = await query<{ id: number }>(
      ws.databaseUrl,
      `INSERT INTO content.rename_demo (document_id, title) VALUES (gen_random_uuid(), 'a') RETURNING id`,
    );
    const [group] = await query<{ id: number }>(
      ws.databaseUrl,
      `INSERT INTO content.rename_demo__parts (component_uid, parent_id, label)
       VALUES (gen_random_uuid(), $1, 'g') RETURNING id`,
      [root?.id],
    );
    await query(
      ws.databaseUrl,
      `INSERT INTO content.rename_demo__parts__entries (component_uid, parent_id, value)
       VALUES (gen_random_uuid(), $1, 'v')`,
      [group?.id],
    );

    await write('part', 'entry');
    const written = await generate(ws);
    expect(written).toMatchObject({ status: 'written' });
    await migrate(ws);

    expect(await contentTables(ws)).toEqual([
      'rename_demo',
      'rename_demo__part',
      'rename_demo__part__entry',
    ]);
    const labels = await query<{ label: string; value: string }>(
      ws.databaseUrl,
      `SELECT g.label, i.value FROM content.rename_demo__part g
       JOIN content.rename_demo__part__entry i ON i.parent_id = g.id`,
    );
    expect(labels).toEqual([{ label: 'g', value: 'v' }]);

    const names = await query<{ name: string }>(
      ws.databaseUrl,
      `SELECT conname AS name FROM pg_constraint
       WHERE connamespace = 'content'::regnamespace AND conrelid::regclass::text LIKE '%rename_demo__part%'
       UNION ALL SELECT indexname FROM pg_indexes
       WHERE schemaname = 'content' AND tablename LIKE 'rename_demo__part%'`,
    );
    expect(names.map((row) => row.name).filter((name) => name.includes('parts'))).toEqual([]);
    expect(names.map((row) => row.name)).toEqual(
      expect.arrayContaining([
        'rename_demo__part_pk',
        'rename_demo__part_parent_fk',
        'rename_demo__part__entry_parent_fk',
        'rename_demo__part__entry_parent_idx',
      ]),
    );

    await query(ws.databaseUrl, 'DELETE FROM content.rename_demo WHERE id = $1', [root?.id]);
    expect(
      await query(ws.databaseUrl, 'SELECT 1 FROM content.rename_demo__part__entry'),
    ).toHaveLength(0);
  });

  it('serialises concurrent migrate runs with the advisory lock', async () => {
    const ws = await workspace();
    await generate(ws);

    const results = await Promise.all([migrate(ws), migrate(ws), migrate(ws)]);
    const applied = results.flatMap((result) => result.applied);
    expect(applied).toEqual(['0001_test.sql']);
    expect(await contentTables(ws)).toHaveLength(6);
    const rows = await query(ws.databaseUrl, 'SELECT name FROM content._migrations');
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
