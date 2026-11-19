import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Client } from 'pg';

import { DEFAULT_CONTENT_PATHS } from '../../src/modules/content-engine/adapters/MigrationFiles.adapter';
import { runContentMigrations } from '../../src/modules/content-engine/adapters/MigrationRunner.adapter';
import { createMigrationDb } from '../../src/modules/content-engine/cli/ContentEngineCli.setup';
import { startPostgres, type TestPostgres } from '../fixtures/Postgres.fixture';

const HEADER_MIGRATION_FILE = '0017_header_restructure.sql';
const SNAPSHOT_FILE = 'snapshot.json';

interface Workspace {
  migrationsDir: string;
  databaseUrl: string;
}

interface NavRow {
  component_uid: string;
  title: string | null;
  link: string | null;
  requires_role: string | null;
  order_index: number;
  published_at: Date | null;
}

describe('migration 0017 header_restructure carries the header data (Postgres 17 via Testcontainers)', () => {
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

  async function copyMigrations(ws: Workspace, isWanted: (name: string) => boolean) {
    const names = (await readdir(DEFAULT_CONTENT_PATHS.migrationsDir)).filter(isWanted);
    for (const name of names) {
      await copyFile(join(DEFAULT_CONTENT_PATHS.migrationsDir, name), join(ws.migrationsDir, name));
    }
  }

  async function migrate(ws: Workspace) {
    const db = createMigrationDb(ws.databaseUrl);
    try {
      return await runContentMigrations(db, ws.migrationsDir);
    } finally {
      await db.destroy();
    }
  }

  /** A database at the 0016 state; the final snapshot only syncs `_content_types`, never the tables. */
  async function workspaceAt0016(): Promise<Workspace> {
    const root = await mkdtemp(join(tmpdir(), 'abyss-header-'));
    cleanup.push(root);
    const migrationsDir = join(root, 'migrations');
    await mkdir(migrationsDir);
    const database = `t_${randomUUID().replace(/-/g, '')}`;
    await query(postgres.getConnectionUri(), `CREATE DATABASE "${database}"`);
    const url = new URL(postgres.getConnectionUri());
    url.pathname = `/${database}`;
    const ws = { migrationsDir, databaseUrl: url.toString() };
    await copyMigrations(
      ws,
      (name) => name === SNAPSHOT_FILE || (name.endsWith('.sql') && name < HEADER_MIGRATION_FILE),
    );
    await migrate(ws);
    return ws;
  }

  async function addHeaderMigration(ws: Workspace) {
    await copyMigrations(ws, (name) => name === HEADER_MIGRATION_FILE);
  }

  interface HeaderSeed {
    documentId: string;
    publishedAt: Date | null;
    name: string;
    navCvLink: string | null;
    notFoundTitle: string | null;
    notFoundDescription: string | null;
  }

  async function insertHeader(ws: Workspace, seed: HeaderSeed): Promise<number> {
    const [row] = await query<{ id: number }>(
      ws.databaseUrl,
      `INSERT INTO content.header
         (document_id, published_at, version, locale, created_by, updated_by, name, nav_label,
          nav_cv_link, not_found_title, not_found_description)
       VALUES ($1, $2, 3, 'en', 7, 8, $3, 'Main menu', $4, $5, $6) RETURNING id`,
      [
        seed.documentId,
        seed.publishedAt,
        seed.name,
        seed.navCvLink,
        seed.notFoundTitle,
        seed.notFoundDescription,
      ],
    );
    return row!.id;
  }

  async function insertNav(
    ws: Workspace,
    headerId: number,
    nav: { uid: string; title: string; role: string | null; order: number },
  ): Promise<number> {
    const [row] = await query<{ id: number }>(
      ws.databaseUrl,
      `INSERT INTO content.header__nav (component_uid, parent_id, order_index, title, requires_role, link)
       VALUES ($1, $2, $3, $4, $5, '/x') RETURNING id`,
      [nav.uid, headerId, nav.order, nav.title, nav.role],
    );
    return row!.id;
  }

  async function insertSubNavigation(
    ws: Workspace,
    navId: number,
    sub: { uid: string; title: string; role: string | null; order: number },
  ) {
    await query(
      ws.databaseUrl,
      `INSERT INTO content.header__nav__sub_navigation
         (component_uid, parent_id, order_index, title, requires_role, link)
       VALUES ($1, $2, $3, $4, $5, '/sub')`,
      [sub.uid, navId, sub.order, sub.title, sub.role],
    );
  }

  async function seedFullHeader(ws: Workspace, documentId: string, publishedAt: Date | null) {
    const headerId = await insertHeader(ws, {
      documentId,
      publishedAt,
      name: 'Abyss',
      navCvLink: 'CV',
      notFoundTitle: 'Not found',
      notFoundDescription: 'Gone',
    });
    const first = await insertNav(ws, headerId, {
      uid: FIRST_NAV_UID,
      title: 'Home',
      role: 'admin',
      order: 0,
    });
    await insertNav(ws, headerId, { uid: SECOND_NAV_UID, title: 'Docs', role: null, order: 1 });
    await insertSubNavigation(ws, first, { uid: FIRST_SUB_UID, title: 'A', role: '', order: 0 });
    await insertSubNavigation(ws, first, {
      uid: SECOND_SUB_UID,
      title: 'B',
      role: 'editor',
      order: 1,
    });
    return headerId;
  }

  const STATE_AT_0016 = { applied: [], headerColumns: ['name'] };
  const FIRST_NAV_UID = randomUUID();
  const SECOND_NAV_UID = randomUUID();
  const FIRST_SUB_UID = randomUUID();
  const SECOND_SUB_UID = randomUUID();

  it('carries name, sub navigations, the CV entry and the not-found text', async () => {
    const ws = await workspaceAt0016();
    const fullDocumentId = randomUUID();
    const bareDocumentId = randomUUID();
    await seedFullHeader(ws, fullDocumentId, null);
    await seedFullHeader(ws, fullDocumentId, new Date('2026-01-01T00:00:00Z'));
    await insertHeader(ws, {
      documentId: bareDocumentId,
      publishedAt: null,
      name: 'Bare',
      navCvLink: null,
      notFoundTitle: '',
      notFoundDescription: null,
    });

    await addHeaderMigration(ws);
    expect((await migrate(ws)).applied).toEqual([HEADER_MIGRATION_FILE]);

    const headers = await query<{ id: number; document_id: string; app_name: string }>(
      ws.databaseUrl,
      'SELECT id, document_id, app_name FROM content.header ORDER BY id',
    );
    expect(headers.map((header) => header.app_name)).toEqual(['Abyss', 'Abyss', 'Bare']);

    const navOf = (headerId: number) =>
      query<NavRow>(
        ws.databaseUrl,
        `SELECT n.component_uid, n.title, n.link, n.requires_role, n.order_index, h.published_at
         FROM content.header__nav n JOIN content.header h ON h.id = n.parent_id
         WHERE n.parent_id = $1 ORDER BY n.order_index`,
        [headerId],
      );
    const [draftNav, publishedNav, bareNav] = await Promise.all(
      headers.map((header) => navOf(header.id)),
    );
    expect(bareNav).toEqual([]);
    for (const nav of [draftNav!, publishedNav!]) {
      expect(
        nav.map(({ title, link, requires_role, order_index }) => [
          title,
          link,
          requires_role,
          order_index,
        ]),
      ).toEqual([
        ['CV', '/cv', 'public', 0],
        ['Home', '/x', 'admin', 1],
        ['Docs', '/x', null, 2],
      ]);
      expect(nav.slice(1).map((row) => row.component_uid)).toEqual([FIRST_NAV_UID, SECOND_NAV_UID]);
    }
    expect(draftNav![0]!.component_uid).toBe(publishedNav![0]!.component_uid);
    expect([FIRST_NAV_UID, SECOND_NAV_UID]).not.toContain(draftNav![0]!.component_uid);

    const subNavs = await query<{
      component_uid: string;
      parent_id: number;
      order_index: number;
      title: string;
      requires_role: string | null;
    }>(
      ws.databaseUrl,
      `SELECT s.component_uid, s.parent_id, s.order_index, s.title, s.requires_role
       FROM content.header__nav__sub_nav s ORDER BY s.parent_id, s.order_index`,
    );
    expect(subNavs).toHaveLength(4);
    const draftHomeId = await query<{ id: number }>(
      ws.databaseUrl,
      `SELECT id FROM content.header__nav WHERE parent_id = $1 AND title = 'Home'`,
      [headers[0]!.id],
    );
    expect(
      subNavs
        .filter((sub) => sub.parent_id === draftHomeId[0]!.id)
        .map(({ component_uid, order_index, title, requires_role }) => [
          component_uid,
          order_index,
          title,
          requires_role,
        ]),
    ).toEqual([
      [FIRST_SUB_UID, 0, 'A', null],
      [SECOND_SUB_UID, 1, 'B', 'editor'],
    ]);

    const notFound = await query<{
      document_id: string;
      version: number;
      published_at: Date | null;
      locale: string;
      created_by: number;
      updated_by: number;
      title: string;
      description: string;
    }>(
      ws.databaseUrl,
      'SELECT document_id, version, published_at, locale, created_by, updated_by, title, description FROM content.module_not_found ORDER BY published_at NULLS FIRST',
    );
    expect(notFound).toHaveLength(2);
    expect(notFound[0]!.document_id).toBe(notFound[1]!.document_id);
    expect(notFound[0]!.document_id).not.toBe(fullDocumentId);
    expect(notFound[0]!.published_at).toBeNull();
    expect(notFound[1]!.published_at).toEqual(new Date('2026-01-01T00:00:00Z'));
    expect(notFound[1]).toMatchObject({
      version: 3,
      locale: 'en',
      created_by: 7,
      updated_by: 8,
      title: 'Not found',
      description: 'Gone',
    });

    const tables = await query<{ table_name: string }>(
      ws.databaseUrl,
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'content' AND table_name = 'header__nav__sub_navigation'`,
    );
    expect(tables).toEqual([]);
    const oldColumns = await query<{ column_name: string }>(
      ws.databaseUrl,
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'content' AND table_name = 'header'
         AND column_name IN ('name', 'nav_label', 'nav_cv_link', 'not_found_title', 'not_found_description')`,
    );
    expect(oldColumns).toEqual([]);
  });

  async function migrateRefusedState(ws: Workspace, expectedMessage: RegExp) {
    await addHeaderMigration(ws);
    await expect(migrate(ws)).rejects.toThrow(expectedMessage);
    const applied = await query<{ name: string }>(
      ws.databaseUrl,
      `SELECT name FROM content._migrations WHERE name = $1`,
      [HEADER_MIGRATION_FILE],
    );
    const columns = await query<{ column_name: string }>(
      ws.databaseUrl,
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'content' AND table_name = 'header' AND column_name IN ('name', 'app_name')`,
    );
    return {
      applied: applied.map((row) => row.name),
      headerColumns: columns.map((row) => row.column_name),
    };
  }

  it('stops and leaves the 0016 state when a stored requires_role is outside the options', async () => {
    const ws = await workspaceAt0016();
    const headerId = await insertHeader(ws, {
      documentId: randomUUID(),
      publishedAt: null,
      name: 'Abyss',
      navCvLink: null,
      notFoundTitle: null,
      notFoundDescription: null,
    });
    await insertNav(ws, headerId, {
      uid: randomUUID(),
      title: 'Home',
      role: 'super-admin',
      order: 0,
    });
    expect(await migrateRefusedState(ws, /requires_role "super-admin"/)).toEqual(STATE_AT_0016);
  });

  it('stops and leaves the 0016 state when a stored skill level is outside the options', async () => {
    const ws = await workspaceAt0016();
    const [page] = await query<{ id: number }>(
      ws.databaseUrl,
      `INSERT INTO content.page_cv_a (document_id) VALUES ($1) RETURNING id`,
      [randomUUID()],
    );
    await query(
      ws.databaseUrl,
      `INSERT INTO content.page_cv_a__skill (component_uid, parent_id, skill, level) VALUES ($1, $2, 'TS', 'Expert')`,
      [randomUUID(), page!.id],
    );
    expect(await migrateRefusedState(ws, /level "Expert"/)).toEqual(STATE_AT_0016);
  });
});
