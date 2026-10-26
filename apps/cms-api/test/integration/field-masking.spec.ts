import { randomUUID } from 'node:crypto';

import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Kysely, PostgresDialect } from 'kysely';
import { Client, Pool } from 'pg';

import { unitOfWorkFromContentTrx } from '../../src/modules/content-engine/adapters/KyselyContentTransactionRunner.adapter';
import {
  accountActor,
  anonymousActor,
} from '../../src/modules/access/domain/ActorContext.entity';
import {
  MASK_SENTINEL,
  MASKED_FIELDS_KEY,
} from '../../src/modules/access/domain/Access.constants';
import {
  projectTable,
  selectedColumns,
} from '../../src/modules/access/domain/FieldProjection.rules';
import {
  type FieldAccess,
  FieldSelection,
} from '../../src/modules/access/domain/PolicyEvaluator';
import {
  type RecordReadAccess,
  recordReadAccess,
} from '../../src/modules/access/domain/RecordReadAccess.rules';
import { RecordSerializer } from '../../src/modules/access/domain/RecordSerializer';
import { WriteAllowlist } from '../../src/modules/access/domain/WriteAllowlist.rules';
import { DEFAULT_CONTENT_PATHS } from '../../src/modules/content-engine/adapters/MigrationFiles.adapter';
import { createMigrationDb } from '../../src/modules/content-engine/cli/ContentEngineCli.setup';
import { CONTENT_DB_SCHEMA } from '../../src/modules/content-engine/domain/ContentEngine.constants';
import type { ContentDocument } from '../../src/modules/content-engine/domain/ContentDocument.entity';
import { rowToValues } from '../../src/modules/content-engine/domain/ContentTree.entity';
import { KyselyContentRepository } from '../../src/modules/content-engine/adapters/KyselyContent.repository';
import { runContentMigrations } from '../../src/modules/content-engine/adapters/MigrationRunner.adapter';
import {
  type RegisteredContentType,
  ContentTypeRegistry,
} from '../../src/modules/content-engine/domain/ContentTypeRegistry.entity';
import {
  type ContentDatabase,
  loadComponentTrees,
} from '../../src/modules/content-engine/adapters/TreeLoader.adapter';
import { systemRole } from '../fixtures/access.fixture';
import { loadRegistryFromDatabase } from '../fixtures/content-registry.fixture';
import { startPostgres } from '../fixtures/postgres.fixture';

const SLUG = 'cv-page';
const ACCOUNT = accountActor(1, systemRole('editor'));
const ANONYMOUS = anonymousActor(systemRole('public'));
const CREATED_BY = 7_654_321;
const SECRET = {
  company: 'RAW-root-company',
  experienceCompany: 'RAW-experience-company',
  phone: 'RAW-reference-phone',
  summary: '<p>RAW-summary</p>',
};

/** Reads like the T20 query will: projected select, then projected trees. */
async function loadProjected(
  db: Kysely<ContentDatabase>,
  type: RegisteredContentType,
  documentId: string,
  access: RecordReadAccess,
): Promise<ContentDocument> {
  const root = projectTable(type.root, access.fields);
  const row = await db
    .withSchema(CONTENT_DB_SCHEMA)
    .selectFrom(root.plan.name)
    .select(selectedColumns(root, access))
    .where('document_id', '=', documentId)
    .where('published_at', 'is', null)
    .executeTakeFirstOrThrow();
  const id = row.id as number;
  const trees = await loadComponentTrees(db, root, [id]);
  return {
    id,
    documentId: row.document_id as string,
    version: row.version as number,
    publishedAt: row.published_at as Date | null,
    locale: row.locale as string | null,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
    createdBy: row.created_by as number | null,
    updatedBy: row.updated_by as number | null,
    values: rowToValues(root, row),
    components: trees.get(id) ?? {},
  };
}

describe('field masking against Postgres (D3/D4, §12-4/§12-5 building blocks)', () => {
  let postgres: StartedPostgreSqlContainer | undefined;
  let db: Kysely<ContentDatabase>;
  let type: RegisteredContentType;
  let repository: KyselyContentRepository;
  const queries: string[] = [];
  const documentId = randomUUID();

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
    let registry: ContentTypeRegistry;
    try {
      await runContentMigrations(
        migrationDb,
        DEFAULT_CONTENT_PATHS.migrationsDir,
      );
      registry = await loadRegistryFromDatabase(migrationDb);
    } finally {
      await migrationDb.destroy();
    }
    type = registry.resolve(SLUG);
    repository = new KyselyContentRepository(registry);
    db = new Kysely<ContentDatabase>({
      dialect: new PostgresDialect({
        pool: new Pool({ connectionString: url.toString() }),
      }),
      log: (event) => {
        if (event.level === 'query') queries.push(event.query.sql);
      },
    });

    await db.transaction().execute((trx) =>
      repository.insertTree(unitOfWorkFromContentTrx(trx), SLUG, {
        documentId,
        publishedAt: null,
        createdBy: CREATED_BY,
        values: {
          position: 'Engineer',
          company: SECRET.company,
          summary: SECRET.summary,
        },
        components: {
          experience: [
            { values: { company: SECRET.experienceCompany, location: 'HN' } },
          ],
          reference: [{ values: { name: 'Ref', phone: SECRET.phone } }],
          skill: [{ values: { skill: 'SQL', level: 'expert' } }],
        },
      }),
    );
  });

  afterAll(async () => {
    await db?.destroy();
    await postgres?.stop();
  });

  const fields: FieldAccess = {
    readable: FieldSelection.of([
      'position',
      'experience.location',
      'reference.name',
    ]),
    writable: FieldSelection.of(['position', 'experience', 'reference']),
  };

  it('never selects unreadable columns or tables, and serializes masks', async () => {
    queries.length = 0;
    const access = recordReadAccess(ACCOUNT, fields.readable);
    const record = await loadProjected(db, type, documentId, access);
    const sql = queries.join('\n');
    expect(sql).not.toMatch(/"company"|"summary"|"phone"|cv_page__skill/);
    expect(sql).toMatch(/"location"/);

    const out = new RecordSerializer(type).serialize(record, access);
    const json = JSON.stringify(out);
    for (const secret of Object.values(SECRET)) {
      expect(json).not.toContain(secret);
    }
    expect(out.values.company).toBe(MASK_SENTINEL);
    expect(out.components.skill).toBeNull();
    expect(out[MASKED_FIELDS_KEY]).toEqual(
      expect.arrayContaining([
        'company',
        'summary',
        'skill',
        'experience.company',
        'reference.phone',
      ]),
    );
  });

  it('a PUT resending the masks leaves the stored values unchanged', async () => {
    const access = recordReadAccess(ACCOUNT, fields.readable);
    const served = new RecordSerializer(type).serialize(
      await loadProjected(db, type, documentId, access),
      access,
    );
    const tree = new WriteAllowlist(type).apply(
      {
        values: { position: 'Staff', company: served.values.company },
        components: {
          experience: served.components.experience,
          reference: served.components.reference,
          skill: served.components.skill,
        },
        [MASKED_FIELDS_KEY]: [],
      },
      fields,
    );
    await db
      .transaction()
      .execute((trx) =>
        repository.replaceTree(
          unitOfWorkFromContentTrx(trx),
          SLUG,
          { documentId, status: 'draft' },
          tree,
        ),
      );

    const stored = await loadProjected(
      db,
      type,
      documentId,
      recordReadAccess(ACCOUNT, FieldSelection.ALL),
    );
    expect(stored.values).toMatchObject({
      position: 'Staff',
      company: SECRET.company,
      summary: SECRET.summary,
    });
    expect(stored.components.experience?.[0]?.values.company).toBe(
      SECRET.experienceCompany,
    );
    expect(stored.components.reference?.[0]?.values.phone).toBe(SECRET.phone);
    expect(stored.components.skill).toHaveLength(1);
  });

  it('anonymous actors never get created_by/updated_by selected or sent', async () => {
    queries.length = 0;
    const access = recordReadAccess(ANONYMOUS, FieldSelection.ALL);
    const out = new RecordSerializer(type).serialize(
      await loadProjected(db, type, documentId, access),
      access,
    );
    expect(queries.join('\n')).not.toMatch(/"created_by"|"updated_by"/);
    expect(out).not.toHaveProperty('createdBy');
    expect(out).not.toHaveProperty('updatedBy');
    expect(JSON.stringify(out)).not.toContain(String(CREATED_BY));
    expect(out.documentId).toBe(documentId);

    const forAccount = new RecordSerializer(type).serialize(
      await loadProjected(
        db,
        type,
        documentId,
        recordReadAccess(ACCOUNT, FieldSelection.ALL),
      ),
      recordReadAccess(ACCOUNT, FieldSelection.ALL),
    );
    expect(forAccount.createdBy).toBe(CREATED_BY);
  });
});
