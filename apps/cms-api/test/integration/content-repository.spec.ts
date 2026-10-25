import { randomUUID } from 'node:crypto';

import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { Client, Pool } from 'pg';

import { unitOfWorkFromContentTrx } from '../../src/modules/content-engine/adapters/KyselyContentTransactionRunner.adapter';
import { DEFAULT_CONTENT_PATHS } from '../../src/modules/content-engine/cli/content-paths';
import { createMigrationDb } from '../../src/modules/content-engine/cli/ContentEngineCli.setup';
import { CONTENT_ERROR_CODES } from '../../src/modules/content-engine/domain/ContentEngine.constants';
import {
  type ContentDocument,
  DocumentNotFoundError,
} from '../../src/modules/content-engine/domain/ContentDocument.entity';
import { KyselyContentRepository } from '../../src/modules/content-engine/adapters/KyselyContent.repository';
import type {
  InsertTreeInput,
  LoadTreesQuery,
} from '../../src/modules/content-engine/application/ContentRepository.port';
import { runContentMigrations } from '../../src/modules/content-engine/adapters/MigrationRunner.adapter';
import {
  ContentTypeRegistry,
  UnknownContentTypeError,
} from '../../src/modules/content-engine/domain/ContentTypeRegistry.entity';
import type { ComponentInput } from '../../src/modules/content-engine/domain/TreeInput.rules';
import type { ComponentNode } from '../../src/modules/content-engine/domain/ContentTree.entity';
import type { ContentDatabase } from '../../src/modules/content-engine/adapters/TreeLoader.adapter';
import { loadRegistryFromDatabase } from '../fixtures/content-registry.fixture';
import { startPostgres } from '../fixtures/postgres.fixture';

const SLUG = 'cv-page';
/** Reads run inside a transaction (the repository takes a unit); only data queries are counted. */
const TRANSACTION_CONTROL = /^(begin|commit|rollback)$/i;
/** cv-page: 1 root + 7 component tables (role is the only depth-2 table). */
const CV_PAGE_TABLE_COUNT = 8;

class RollbackSignal extends Error {}

function cvPage(documentId: string, label: string): InsertTreeInput {
  return {
    documentId,
    publishedAt: null,
    values: {
      position: `Engineer ${label}`,
      isMain: true,
      company: `Company ${label}`,
    },
    components: {
      skill: [
        { values: { skill: 'TypeScript', level: 'expert' } },
        { values: { skill: 'SQL', level: 'advanced' } },
      ],
      experience: [
        {
          values: { company: `Acme ${label}`, location: 'Hanoi' },
          components: {
            role: [
              {
                values: {
                  position: 'Lead',
                  teamSize: 6,
                  techStack: ['NestJS', 'Postgres'],
                },
              },
              { values: { position: 'Senior', period: '2020-2022' } },
            ],
          },
        },
        {
          values: { company: `Globex ${label}` },
          components: { role: [{ values: { position: 'Junior' } }] },
        },
      ],
      language: [{ values: { language: 'English', level: 'C1' } }],
    },
  };
}

/** The tree as a client sends it back: uids kept, values copied. */
function echo(node: ComponentNode): ComponentInput {
  return {
    componentUid: node.componentUid,
    values: node.values,
    components: Object.fromEntries(
      Object.entries(node.components).map(([name, items]) => [
        name,
        items.map(echo),
      ]),
    ),
  };
}

function component(
  parent: Pick<ComponentNode, 'components'> | undefined,
  field: string,
  index: number,
): ComponentNode {
  const node = parent?.components[field]?.[index];
  if (node === undefined) throw new Error(`no ${field}[${index}]`);
  return node;
}

describe('KyselyContentRepository on cv-page (Postgres 16 via Testcontainers)', () => {
  let postgres: StartedPostgreSqlContainer;
  let db: Kysely<ContentDatabase>;
  let repository: KyselyContentRepository;
  let registry: ContentTypeRegistry;
  let queries: string[] = [];

  beforeAll(async () => {
    postgres = await startPostgres();
    const database = `t_${randomUUID().replace(/-/g, '')}`;
    const admin = new Client({ connectionString: postgres.getConnectionUri() });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${database}"`);
    await admin.end();
    const url = new URL(postgres.getConnectionUri());
    url.pathname = `/${database}`;

    const migrationDb = createMigrationDb(url.toString());
    try {
      await runContentMigrations(
        migrationDb,
        DEFAULT_CONTENT_PATHS.migrationsDir,
      );
      registry = await loadRegistryFromDatabase(migrationDb);
    } finally {
      await migrationDb.destroy();
    }

    db = new Kysely<ContentDatabase>({
      dialect: new PostgresDialect({
        pool: new Pool({ connectionString: url.toString() }),
      }),
      log: (event) => {
        if (
          event.level === 'query' &&
          !TRANSACTION_CONTROL.test(event.query.sql)
        ) {
          queries.push(event.query.sql);
        }
      },
    });
    repository = new KyselyContentRepository(registry);
  });

  afterAll(async () => {
    await db?.destroy();
    await postgres?.stop();
  });

  beforeEach(() => {
    queries = [];
  });

  async function insert(input: InsertTreeInput): Promise<number> {
    return db
      .transaction()
      .execute((trx) =>
        repository.insertTree(unitOfWorkFromContentTrx(trx), SLUG, input),
      );
  }

  function loadTrees(
    slug: string,
    query: LoadTreesQuery,
  ): Promise<ContentDocument[]> {
    return db
      .transaction()
      .execute((trx) =>
        repository.loadTrees(unitOfWorkFromContentTrx(trx), slug, query),
      );
  }

  async function loadOne(
    documentId: string,
    status: 'draft' | 'published' = 'draft',
  ): Promise<ContentDocument | undefined> {
    const [document] = await loadTrees(SLUG, {
      status,
      documentIds: [documentId],
    });
    return document;
  }

  async function countRows(table: string, parentId: number): Promise<number> {
    const result = await sql<{ count: string }>`
      SELECT count(*) AS count FROM ${sql.table(`content.${table}`)}
      WHERE parent_id = ${parentId}`.execute(db);
    return Number(result.rows[0]?.count);
  }

  describe('registry', () => {
    it('resolves cv-page to its table plans', () => {
      const type = registry.resolve(SLUG);
      expect(type.tables).toHaveLength(CV_PAGE_TABLE_COUNT);
      expect(type.root.plan.name).toBe('cv_page');
      expect(registry.slugs()).toEqual([SLUG, 'profile']);
    });

    it('rejects an unknown slug with a typed error before any SQL', async () => {
      expect(() => registry.resolve('cv_page')).toThrow(
        UnknownContentTypeError,
      );
      await expect(
        loadTrees('nope; DROP TABLE x', { status: 'draft' }),
      ).rejects.toMatchObject({
        code: CONTENT_ERROR_CODES.CONTENT_TYPE_UNKNOWN,
      });
      expect(queries).toEqual([]);
    });
  });

  it('round-trips a 3-level tree with API names, order and raw values', async () => {
    const documentId = randomUUID();
    const id = await insert(cvPage(documentId, 'A'));

    const document = await loadOne(documentId);
    expect(document).toMatchObject({
      id,
      documentId,
      version: 1,
      publishedAt: null,
      values: {
        position: 'Engineer A',
        isMain: true,
        company: 'Company A',
        summary: null,
      },
    });
    expect(document?.components.skill?.map((node) => node.values)).toEqual([
      { skill: 'TypeScript', level: 'expert' },
      { skill: 'SQL', level: 'advanced' },
    ]);
    expect(document?.components.project).toEqual([]);
    const acme = component(document, 'experience', 0);
    expect(acme.values).toEqual({ company: 'Acme A', location: 'Hanoi' });
    expect(acme.components.role?.map((node) => node.values)).toEqual([
      {
        position: 'Lead',
        period: null,
        teamSize: 6,
        projects: null,
        techStack: ['NestJS', 'Postgres'],
        responsibilities: null,
      },
      expect.objectContaining({ position: 'Senior', period: '2020-2022' }),
    ]);
    expect(acme.components.role?.map((node) => node.orderIndex)).toEqual([
      0, 1,
    ]);
    expect(
      component(document, 'experience', 1).components.role?.[0]?.values,
    ).toMatchObject({ position: 'Junior' });
  });

  it('loads N roots with one query per level table, never per row', async () => {
    const full = [randomUUID(), randomUUID(), randomUUID()];
    for (const [index, documentId] of full.entries()) {
      await insert(cvPage(documentId, String(index)));
    }
    const bare = randomUUID();
    await insert({ documentId: bare, publishedAt: null, values: {} });

    queries = [];
    const documents = await loadTrees(SLUG, {
      status: 'draft',
      documentIds: full,
    });
    expect(documents).toHaveLength(full.length);
    expect(
      documents.flatMap((document) => document.components.experience ?? []),
    ).toHaveLength(full.length * 2);
    // 1 root query + 7 component tables, whatever N is.
    expect(queries).toHaveLength(CV_PAGE_TABLE_COUNT);
    expect(
      queries.slice(1).every((text) => /= any\(\$1::int\[\]\)/.test(text)),
    ).toBe(true);

    queries = [];
    await loadTrees(SLUG, {
      status: 'draft',
      documentIds: [bare],
    });
    // No experience rows, so the role table is not queried.
    expect(queries).toHaveLength(CV_PAGE_TABLE_COUNT - 1);

    queries = [];
    expect(
      await loadTrees(SLUG, {
        status: 'published',
        documentIds: full,
      }),
    ).toEqual([]);
    expect(queries).toHaveLength(1);
  });

  it('replaceTree keeps, updates, adds and removes components by uid', async () => {
    const documentId = randomUUID();
    await insert(cvPage(documentId, 'R'));
    const before = await loadOne(documentId);
    const acme = component(before, 'experience', 0);
    const globex = component(before, 'experience', 1);
    const lead = component(acme, 'role', 0);
    const typescript = component(before, 'skill', 0);

    await db.transaction().execute((trx) =>
      repository.replaceTree(
        unitOfWorkFromContentTrx(trx),
        SLUG,
        { documentId, status: 'draft' },
        {
          values: { summary: 'Updated summary' },
          components: {
            // Reordered + updated, SQL dropped, one new.
            skill: [
              { values: { skill: 'Go' } },
              { ...echo(typescript), values: { level: 'master' } },
            ],
            // Globex removed (its role cascades); Acme kept with roles edited.
            experience: [
              {
                ...echo(acme),
                values: { location: 'Remote' },
                components: {
                  role: [
                    { values: { position: 'Staff' } },
                    { ...echo(lead), values: { teamSize: 9 } },
                  ],
                },
              },
            ],
          },
        },
      ),
    );

    const after = await loadOne(documentId);
    expect(after?.values).toMatchObject({
      position: 'Engineer R',
      summary: 'Updated summary',
    });
    expect(after?.components.skill?.map((node) => node.values)).toEqual([
      { skill: 'Go', level: null },
      { skill: 'TypeScript', level: 'master' },
    ]);
    const keptSkill = component(after, 'skill', 1);
    expect(keptSkill).toMatchObject({
      id: typescript.id,
      componentUid: typescript.componentUid,
      orderIndex: 1,
    });
    expect(component(after, 'skill', 0).componentUid).not.toBe(
      typescript.componentUid,
    );

    expect(after?.components.experience).toHaveLength(1);
    const acmeAfter = component(after, 'experience', 0);
    expect(acmeAfter).toMatchObject({
      id: acme.id,
      componentUid: acme.componentUid,
      values: { company: 'Acme R', location: 'Remote' },
    });
    expect(acmeAfter.components.role?.map((node) => node.values)).toEqual([
      expect.objectContaining({ position: 'Staff' }),
      expect.objectContaining({
        position: 'Lead',
        teamSize: 9,
        techStack: ['NestJS', 'Postgres'],
      }),
    ]);
    expect(acmeAfter.components.role?.[1]).toMatchObject({
      id: lead.id,
      componentUid: lead.componentUid,
    });
    // Senior was not sent back; Globex's subtree cascaded away.
    expect(await countRows('cv_page__experience__role', acme.id)).toBe(2);
    expect(await countRows('cv_page__experience__role', globex.id)).toBe(0);
    // Component fields absent from the input are left untouched.
    expect(after?.components.language).toEqual(before?.components.language);
  });

  it('never touches rows of another root, even when sent their uids', async () => {
    const mine = randomUUID();
    const other = randomUUID();
    await insert(cvPage(mine, 'M'));
    await insert(cvPage(other, 'O'));
    const otherBefore = await loadOne(other);
    const otherAcme = component(otherBefore, 'experience', 0);

    await expect(
      db
        .transaction()
        .execute((trx) =>
          repository.replaceTree(
            unitOfWorkFromContentTrx(trx),
            SLUG,
            { documentId: mine, status: 'draft' },
            { components: { experience: [echo(otherAcme)] } },
          ),
        ),
    ).rejects.toMatchObject({
      code: CONTENT_ERROR_CODES.TREE_UNKNOWN_UID,
      path: ['components', 'experience', 0, 'componentUid'],
    });

    await db
      .transaction()
      .execute((trx) =>
        repository.replaceTree(
          unitOfWorkFromContentTrx(trx),
          SLUG,
          { documentId: mine, status: 'draft' },
          { components: { experience: [], skill: [] } },
        ),
      );
    const mineAfter = await loadOne(mine);
    expect(mineAfter?.components.experience).toEqual([]);
    expect(mineAfter?.components.skill).toEqual([]);
    expect(await loadOne(other)).toEqual(otherBefore);
  });

  it('targets the draft row only, leaving the published row of the document', async () => {
    const documentId = randomUUID();
    await insert(cvPage(documentId, 'D'));
    await insert({
      ...cvPage(documentId, 'P'),
      publishedAt: new Date('2026-01-01T00:00:00Z'),
    });
    const published = await loadOne(documentId, 'published');

    await db
      .transaction()
      .execute((trx) =>
        repository.replaceTree(
          unitOfWorkFromContentTrx(trx),
          SLUG,
          { documentId, status: 'draft' },
          { values: { company: 'Draft only' }, components: { experience: [] } },
        ),
      );
    expect((await loadOne(documentId))?.values.company).toBe('Draft only');
    expect(await loadOne(documentId, 'published')).toEqual(published);
  });

  it('rolls back every write when the caller transaction fails', async () => {
    const documentId = randomUUID();
    await insert(cvPage(documentId, 'T'));
    const before = await loadOne(documentId);
    const acme = component(before, 'experience', 0);

    await expect(
      db.transaction().execute(async (trx) => {
        await repository.replaceTree(
          unitOfWorkFromContentTrx(trx),
          SLUG,
          { documentId, status: 'draft' },
          {
            values: { company: 'Changed' },
            components: { experience: [], skill: [] },
          },
        );
        throw new RollbackSignal('caller failed after replaceTree');
      }),
    ).rejects.toBeInstanceOf(RollbackSignal);
    expect(await loadOne(documentId)).toEqual(before);

    // A failure deep in the tree (after earlier tables were written) also rolls back.
    await expect(
      db.transaction().execute((trx) =>
        repository.replaceTree(
          unitOfWorkFromContentTrx(trx),
          SLUG,
          { documentId, status: 'draft' },
          {
            components: {
              skill: [],
              experience: [
                {
                  ...echo(acme),
                  components: { role: [{ componentUid: randomUUID() }] },
                },
              ],
            },
          },
        ),
      ),
    ).rejects.toMatchObject({ code: CONTENT_ERROR_CODES.TREE_UNKNOWN_UID });
    expect(await loadOne(documentId)).toEqual(before);

    const lost = randomUUID();
    await expect(
      db.transaction().execute(async (trx) => {
        await repository.insertTree(
          unitOfWorkFromContentTrx(trx),
          SLUG,
          cvPage(lost, 'L'),
        );
        throw new RollbackSignal('caller failed after insertTree');
      }),
    ).rejects.toBeInstanceOf(RollbackSignal);
    expect(await loadOne(lost)).toBeUndefined();
  });

  it('reports a missing document and rejects malformed input before SQL', async () => {
    const ref = { documentId: randomUUID(), status: 'draft' as const };
    await expect(
      db
        .transaction()
        .execute((trx) =>
          repository.replaceTree(unitOfWorkFromContentTrx(trx), SLUG, ref, {}),
        ),
    ).rejects.toBeInstanceOf(DocumentNotFoundError);

    queries = [];
    await expect(
      db.transaction().execute((trx) =>
        repository.insertTree(unitOfWorkFromContentTrx(trx), SLUG, {
          documentId: randomUUID(),
          publishedAt: null,
          values: { position: 'x', 'position"; DROP TABLE x; --': 'y' },
        }),
      ),
    ).rejects.toMatchObject({ code: CONTENT_ERROR_CODES.TREE_INVALID });
    await expect(
      loadTrees(SLUG, {
        status: 'draft',
        documentIds: ['not-a-uuid'],
      }),
    ).rejects.toMatchObject({ code: CONTENT_ERROR_CODES.TREE_INVALID_UID });
    // Only the transaction's BEGIN/ROLLBACK reached the database.
    expect(queries.every((text) => /^(begin|rollback)$/i.test(text))).toBe(
      true,
    );
  });
});
