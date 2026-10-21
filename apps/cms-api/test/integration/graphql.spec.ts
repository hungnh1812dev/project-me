import { randomUUID } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { Kysely } from 'kysely';
import { Client } from 'pg';
import request from 'supertest';

import {
  openPrisma,
  type PrismaHandle,
} from '../../src/infrastructure/database/prisma-client';
import { MASKED_FIELDS_KEY } from '../../src/modules/access/access.constants';
import { seedRolePermissions } from '../../src/modules/access/role-permissions.seed';
import { createContentDb } from '../../src/modules/content-engine/content-database';
import { ContentRegistryProvider } from '../../src/modules/content-engine/content-engine.module';
import { ContentRepository } from '../../src/modules/content-engine/content.repository';
import { RegistryService } from '../../src/modules/content-engine/registry.service';
import {
  emptySnapshot,
  planMigration,
} from '../../src/modules/content-engine/sql-generator';
import type { ContentDatabase } from '../../src/modules/content-engine/tree-loader';
import { hashPassword } from '../../src/modules/identity/password-hasher';
import { seedSystemRoles } from '../../src/modules/identity/system-roles.seed';
import {
  ARTICLE_DEFINITION,
  NOTE_DEFINITION,
} from '../fixtures/access.fixture';
import { createCoreTemplate } from '../fixtures/core-db.fixture';
import {
  dbEnvOf,
  devEnv,
  TEST_ADMIN_ORIGIN,
  TEST_JWT_KID,
  TEST_SECRET_32_BYTES,
  TEST_WEB_ORIGIN,
} from '../fixtures/env.fixture';
import { startPostgres } from '../fixtures/postgres.fixture';
import { createTestApp } from '../fixtures/test-app';

const PASSWORD = 'correct horse battery staple';
const DOCUMENTS = '/api/v1/documents';
const GRAPHQL = '/api/v1/graphql';
const ROLES = '/api/v1/roles';
const TOKENS = '/api/v1/api-tokens';
const LOGIN = '/api/v1/auth/login';
const OCTET_RANGE = 250;
const CREATOR_ID = 424_242;
const RAW_PHONE = 'RAW-PHONE-5551234';
const RAW_BODY = '<p>RAW-BODY-SECRET</p>';

let ipCounter = 0;
function nextIp(): string {
  ipCounter += 1;
  return `10.4.${Math.floor(ipCounter / OCTET_RANGE)}.${(ipCounter % OCTET_RANGE) + 1}`;
}

interface DocRecord {
  documentId: string;
  version: number;
  values: JsonObject;
  components: { reference: { values: JsonObject }[] | null };
  createdBy?: number;
  updatedBy?: number;
  [MASKED_FIELDS_KEY]: string[];
}
type JsonObject = { [key: string]: unknown };
interface Page {
  data: DocRecord[];
  meta: { page: number; pageSize: number; total: number };
}

const ids = {
  alpha: randomUUID(),
  beta: randomUUID(),
  gamma: randomUUID(),
  delta: randomUUID(),
  draftOnly: randomUUID(),
  note: randomUUID(),
};

interface Seed {
  documentId: string;
  published: boolean;
  title: string;
  priority: number;
  score: string;
  featured: boolean;
  releaseDate: string;
  releasedAt: string;
  phone: string;
}

const SEEDS: Seed[] = [
  {
    documentId: ids.alpha,
    published: true,
    title: 'Alpha',
    priority: 3,
    score: '1.50',
    featured: true,
    releaseDate: '2026-03-01',
    releasedAt: '2026-03-01T10:00:00Z',
    phone: RAW_PHONE,
  },
  {
    documentId: ids.beta,
    published: true,
    title: 'Beta 100% real',
    priority: 1,
    score: '20.00',
    featured: false,
    releaseDate: '2026-01-15',
    releasedAt: '2026-01-15T10:00:00Z',
    phone: RAW_PHONE,
  },
  {
    documentId: ids.gamma,
    published: true,
    title: 'Gamma',
    priority: 2,
    score: '3.25',
    featured: true,
    releaseDate: '2026-02-10',
    releasedAt: '2026-02-10T10:00:00Z',
    phone: RAW_PHONE,
  },
  {
    documentId: ids.delta,
    published: true,
    title: 'Delta',
    priority: 4,
    score: '4.00',
    featured: false,
    releaseDate: '2026-04-01',
    releasedAt: '2026-04-01T10:00:00Z',
    phone: RAW_PHONE,
  },
  {
    documentId: ids.delta,
    published: false,
    title: 'Delta DRAFT',
    priority: 4,
    score: '4.00',
    featured: false,
    releaseDate: '2026-04-01',
    releasedAt: '2026-04-01T10:00:00Z',
    phone: RAW_PHONE,
  },
  {
    documentId: ids.draftOnly,
    published: false,
    title: 'Only a draft',
    priority: 9,
    score: '9.00',
    featured: false,
    releaseDate: '2026-05-01',
    releasedAt: '2026-05-01T10:00:00Z',
    phone: RAW_PHONE,
  },
];

describe('GraphQL read API (GQ2; Postgres 16 via Testcontainers)', () => {
  let postgres: StartedPostgreSqlContainer;
  let app: NestExpressApplication;
  let db: PrismaHandle;
  let content: Kysely<ContentDatabase>;
  let accountCount = 0;
  let owner: string;
  let editor: string;
  let guest: string;
  let narrowReader: string;
  let priorityThree: string;
  let publicRoleId: string;

  beforeAll(async () => {
    postgres = await startPostgres();
    const template = await createCoreTemplate(postgres.getConnectionUri());
    const databaseUrl = await template.fresh();
    db = openPrisma(databaseUrl);
    await seedSystemRoles(db.prisma);
    await seedRolePermissions(db.prisma);

    const registry = RegistryService.fromDefinitions([
      ARTICLE_DEFINITION,
      NOTE_DEFINITION,
    ]);
    const definitions = registry
      .slugs()
      .map((slug) => registry.resolve(slug).definition);
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query(
      planMigration(emptySnapshot(), definitions).statements.join('\n'),
    );
    await client.end();

    content = createContentDb(databaseUrl);
    const repository = new ContentRepository(registry);
    await content.transaction().execute(async (trx) => {
      for (const seed of SEEDS) {
        await repository.insertTree(trx, 'article', {
          documentId: seed.documentId,
          publishedAt: seed.published ? new Date() : null,
          createdBy: CREATOR_ID,
          values: {
            title: seed.title,
            body: RAW_BODY,
            priority: seed.priority,
            score: seed.score,
            featured: seed.featured,
            releaseDate: seed.releaseDate,
            releasedAt: seed.releasedAt,
            meta: { secret: 'RAW-META' },
          },
          components: {
            reference: [{ values: { name: 'Ann', phone: seed.phone } }],
          },
        });
      }
      await repository.insertTree(trx, 'note', {
        documentId: ids.note,
        publishedAt: null,
        values: { text: 'a live note' },
      });
    });

    app = await createTestApp(
      devEnv({
        ...dbEnvOf(databaseUrl),
        JWT_ACCESS_SECRET: TEST_SECRET_32_BYTES,
        JWT_ACCESS_KID: TEST_JWT_KID,
        OTP_PEPPER: TEST_SECRET_32_BYTES,
        ADMIN_ORIGIN: TEST_ADMIN_ORIGIN,
        WEB_ORIGIN: TEST_WEB_ORIGIN,
        TRUST_PROXY_HOPS: '1',
      }),
      [
        {
          token: ContentRegistryProvider,
          value: { registry: () => Promise.resolve(registry) },
        },
      ],
    );
    const roles = await db.prisma.role.findMany({
      select: { slug: true, documentId: true },
    });
    publicRoleId = roles.find((r) => r.slug === 'public')?.documentId ?? '';
    owner = await signedIn('owner');
    editor = await signedIn('editor');
    guest = await signedIn('guest');
    await customRole('narrow-readers', 20, [
      {
        subject: 'article',
        action: 'read',
        readableFields: ['title', 'reference.name'],
      },
    ]);
    narrowReader = await signedIn('narrow-readers');
    await customRole('priority-three', 21, [
      {
        subject: 'article',
        action: 'read',
        conditions: {
          all: [{ field: 'priority', op: 'eq', value: 3 }],
        },
      },
    ]);
    priorityThree = await signedIn('priority-three');
  });

  afterAll(async () => {
    await app?.close();
    await content?.destroy();
    await db?.close();
    await postgres?.stop();
  });

  const http = () => request(app.getHttpServer());
  const asAnonymous = () => ({ 'X-Forwarded-For': nextIp() });
  const bearer = (token: string) => ({
    Authorization: `Bearer ${token}`,
    'X-Forwarded-For': nextIp(),
  });

  async function signedIn(roleSlug: string): Promise<string> {
    accountCount += 1;
    const email = `gq2-user${accountCount}@example.test`;
    await db.prisma.account.create({
      data: {
        email,
        displayName: `User ${accountCount}`,
        passwordHash: await hashPassword(PASSWORD),
        status: 'active',
        role: { connect: { slug: roleSlug } },
      },
    });
    const res = await http()
      .post(LOGIN)
      .set('X-Forwarded-For', nextIp())
      .send({ email, password: PASSWORD });
    expect(res.status).toBe(200);
    return (res.body as { accessToken: string }).accessToken;
  }

  async function customRole(
    slug: string,
    rank: number,
    permissions: JsonObject[],
  ): Promise<string> {
    const created = await http()
      .post(ROLES)
      .set(bearer(owner))
      .send({ slug, name: slug, rank });
    expect(created.status).toBe(201);
    const roleId = (created.body as { id: string }).id;
    await setPermissions(roleId, permissions);
    return roleId;
  }

  async function setPermissions(roleId: string, permissions: JsonObject[]) {
    const put = await http()
      .put(`${ROLES}/${roleId}/permissions`)
      .set(bearer(owner))
      .send({ permissions });
    expect(put.status).toBe(200);
  }

  async function apiToken(scope: JsonObject[]): Promise<string> {
    const res = await http()
      .post(TOKENS)
      .set(bearer(owner))
      .send({ name: 'gq2', scope: { permissions: scope } });
    expect(res.status).toBe(201);
    return (res.body as { token: string }).token;
  }

  const gql = (
    query: string,
    options: { headers?: JsonObject; variables?: JsonObject } = {},
  ) =>
    http()
      .post(GRAPHQL)
      .set((options.headers ?? asAnonymous()) as Record<string, string>)
      .send({ query, variables: options.variables });
  const rest = (query: string, headers: JsonObject = asAnonymous()) =>
    http()
      .get(`${DOCUMENTS}/article${query}`)
      .set(headers as Record<string, string>);

  interface GqlBody {
    data?: Record<string, unknown> | null;
    errors?: {
      message: string;
      extensions: { code: string; requestId?: string; details?: unknown };
    }[];
  }
  interface GqlArticle {
    documentId: string;
    version: number;
    title: string | null;
    body: string | null;
    priority: number | null;
    score: string | null;
    releaseDate: string | null;
    reference: { name: string | null; phone: string | null } | null;
    _maskedFields: string[];
  }
  const ARTICLE_FIELDS = `documentId version title body priority score releaseDate
    reference { name phone } _maskedFields`;
  const LIST = `query List($sort: [ArticleSort!], $filter: ArticleFilter, $status: DocumentStatus = PUBLISHED, $page: Int = 1, $pageSize: Int = 20) {
    articleList(sort: $sort, filter: $filter, status: $status, page: $page, pageSize: $pageSize) {
      data { ${ARTICLE_FIELDS} } meta { page pageSize total } } }`;
  const bodyOf = (res: request.Response) => res.body as GqlBody;
  const listOf = (res: request.Response) =>
    (
      bodyOf(res).data?.articleList as {
        data: GqlArticle[];
        meta: { page: number; pageSize: number; total: number };
      } | null
    )?.data ?? [];
  const titles = (res: request.Response) =>
    listOf(res).map((record) => record.title);
  const sortTitle = { sort: [{ field: 'title' }] };

  /** The REST record re-shaped like the GraphQL selection. */
  function shaped(record: DocRecord): GqlArticle {
    const { values } = record;
    return {
      documentId: record.documentId,
      version: record.version,
      title: (values.title as string | null) ?? null,
      body: (values.body as string | null) ?? null,
      priority: (values.priority as number | null) ?? null,
      score: (values.score as string | null) ?? null,
      releaseDate: (values.releaseDate as string | null) ?? null,
      // Not repeatable: the one item, as the schema says.
      reference: (() => {
        const item = record.components.reference?.[0];
        return item === undefined
          ? null
          : {
              name: (item.values.name as string | null) ?? null,
              phone: (item.values.phone as string | null) ?? null,
            };
      })(),
      _maskedFields: record[MASKED_FIELDS_KEY],
    };
  }

  describe('parity with the REST read path', () => {
    it.each([
      ['anonymous', () => asAnonymous()],
      ['an editor JWT', () => bearer(editor)],
      ['a narrow reader JWT (masked fields)', () => bearer(narrowReader)],
    ])('list data equals REST for %s', async (_name, headers) => {
      const viaGraphql = await gql(LIST, {
        headers: headers(),
        variables: sortTitle,
      });
      const viaRest = await rest('?sort=title', headers());
      expect(viaGraphql.status).toBe(200);
      expect(viaGraphql.headers['cache-control']).toContain('no-store');
      expect(bodyOf(viaGraphql).errors).toBeUndefined();
      const page = (bodyOf(viaGraphql).data?.articleList ?? {}) as {
        data: GqlArticle[];
        meta: unknown;
      };
      const restPage = viaRest.body as Page;
      expect(page.data).toEqual(restPage.data.map(shaped));
      expect(page.meta).toEqual(restPage.meta);
    });

    it('an API token reads the same masked data as REST', async () => {
      const token = await apiToken([
        { subject: 'article', action: 'read', readableFields: ['title'] },
      ]);
      const viaGraphql = await gql(LIST, {
        headers: bearer(token),
        variables: sortTitle,
      });
      const viaRest = await rest('?sort=title', bearer(token));
      expect(listOf(viaGraphql)).toEqual(
        (viaRest.body as Page).data.map(shaped),
      );
      expect(JSON.stringify(viaGraphql.body)).not.toContain('RAW');
      expect(listOf(viaGraphql)[0]?.body).toBe('***');
    });

    it('the item field equals the REST detail; a missing or draft-only id is null without error', async () => {
      const item = (
        id: string,
        status = 'PUBLISHED',
        headers = asAnonymous(),
      ) =>
        gql(
          `query($id: ID!, $status: DocumentStatus) { article(documentId: $id, status: $status) { ${ARTICLE_FIELDS} } }`,
          { headers, variables: { id, status } },
        );
      const found = await item(ids.alpha);
      const detail = await http()
        .get(`${DOCUMENTS}/article/${ids.alpha}`)
        .set(asAnonymous());
      expect(bodyOf(found).data?.article).toEqual(
        shaped(detail.body as DocRecord),
      );
      for (const id of [randomUUID(), ids.draftOnly]) {
        const missing = await item(id);
        expect(missing.status).toBe(200);
        expect(bodyOf(missing)).toEqual({ data: { article: null } });
      }
      const bad = await item('not-a-uuid');
      expect(bodyOf(bad).data).toEqual({ article: null });
      expect(bodyOf(bad).errors?.[0]?.extensions.code).toBe(
        'ACCESS_INVALID_REQUEST',
      );
    });

    it('applies row conditions: hidden rows are null and not in total', async () => {
      const res = await gql(LIST, { headers: bearer(priorityThree) });
      expect(titles(res)).toEqual(['Alpha']);
      const page = bodyOf(res).data?.articleList as {
        meta: { total: number };
      };
      expect(page.meta.total).toBe(1);
      const hidden = await gql(
        `{ article(documentId: "${ids.gamma}") { title } }`,
        { headers: bearer(priorityThree) },
      );
      expect(bodyOf(hidden)).toEqual({ data: { article: null } });
    });

    it('sorts by default like REST (newest updatedAt first) and honours filters and paging', async () => {
      const viaGraphql = await gql(LIST);
      const viaRest = await rest('');
      expect(titles(viaGraphql)).toEqual(
        (viaRest.body as Page).data.map((r) => r.values.title),
      );
      const filtered = await gql(LIST, {
        variables: {
          filter: { priority: { gte: 2 }, title: { contains: '100%' } },
        },
      });
      expect(titles(filtered)).toEqual([]);
      const some = await gql(LIST, {
        variables: { filter: { featured: { eq: true } }, ...sortTitle },
      });
      expect(titles(some)).toEqual(['Alpha', 'Gamma']);
      const paged = await gql(LIST, {
        variables: { ...sortTitle, page: 2, pageSize: 3 },
      });
      expect(titles(paged)).toEqual(['Gamma']);
    });
  });

  describe('errors', () => {
    it('filter or sort on a masked field is FIELD_NOT_READABLE with data null', async () => {
      for (const variables of [
        { filter: { priority: { eq: 3 } } },
        { sort: [{ field: 'priority' }] },
      ]) {
        const res = await gql(LIST, {
          headers: bearer(narrowReader),
          variables,
        });
        expect(res.status).toBe(200);
        expect(bodyOf(res).data).toEqual({ articleList: null });
        expect(bodyOf(res).errors?.[0]?.extensions.code).toBe(
          'FIELD_NOT_READABLE',
        );
        expect(bodyOf(res).errors?.[0]?.extensions.requestId).toBeDefined();
      }
    });

    it('drafts: anonymous gets FORBIDDEN, an editor reads them', async () => {
      const denied = await gql(LIST, { variables: { status: 'DRAFT' } });
      expect(denied.status).toBe(200);
      expect(bodyOf(denied).errors?.[0]?.extensions.code).toBe('FORBIDDEN');
      expect(bodyOf(denied).data).toEqual({ articleList: null });
      const allowed = await gql(LIST, {
        headers: bearer(editor),
        variables: { status: 'DRAFT', ...sortTitle },
      });
      expect(titles(allowed)).toEqual(['Delta DRAFT', 'Only a draft']);
    });

    it.each([
      ['page 0', { page: 0 }],
      ['page 10001', { page: 10_001 }],
      ['pageSize 0', { pageSize: 0 }],
      ['pageSize 101', { pageSize: 101 }],
      [
        'four sort keys',
        {
          sort: ['title', 'priority', 'score', 'version'].map((field) => ({
            field,
          })),
        },
      ],
      [
        'a repeated sort key',
        { sort: [{ field: 'title' }, { field: 'title' }] },
      ],
      ['an empty in list', { filter: { title: { in: [] } } }],
      [
        'too many in values',
        { filter: { title: { in: Array.from({ length: 21 }, () => 'x') } } },
      ],
      ['a too long value', { filter: { title: { eq: 'x'.repeat(256) } } }],
    ])(
      '%s is ACCESS_INVALID_REQUEST before any SQL',
      async (_name, variables) => {
        const res = await gql(LIST, { variables });
        expect(res.status).toBe(200);
        expect(bodyOf(res).data).toEqual({ articleList: null });
        expect(bodyOf(res).errors?.[0]?.extensions.code).toBe(
          'ACCESS_INVALID_REQUEST',
        );
      },
    );

    it('a rejected variable never echoes the submitted value', async () => {
      const res = await gql(LIST, {
        variables: { page: 'SECRET-VALUE' },
      });
      expect(res.status).toBe(400);
      expect(bodyOf(res).data).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain('SECRET-VALUE');
    });

    it('parse and validation errors are 400 without data', async () => {
      const parse = await gql('{ articleList { ');
      expect(parse.status).toBe(400);
      expect(bodyOf(parse).errors?.[0]?.extensions.code).toBe(
        'GRAPHQL_PARSE_FAILED',
      );
      const invalid = await gql('{ articleList { nope } }');
      expect(invalid.status).toBe(400);
      expect(bodyOf(invalid).data).toBeUndefined();
      expect(bodyOf(invalid).errors?.[0]?.extensions.code).toBe(
        'GRAPHQL_VALIDATION_FAILED',
      );
    });
  });

  describe('hidden = unknown', () => {
    const MESSAGE = (name: string) =>
      `Cannot query field "${name}" on type "Query".`;

    it('a type the role cannot read fails exactly like an unknown field', async () => {
      const hidden = await gql('{ articleList { meta { total } } }', {
        headers: bearer(guest),
      });
      const unknown = await gql('{ nopeList { meta { total } } }', {
        headers: bearer(guest),
      });
      expect(hidden.status).toBe(400);
      expect(bodyOf(hidden).errors?.[0]?.message).toBe(MESSAGE('articleList'));
      expect(bodyOf(unknown).errors?.[0]?.message).toBe(MESSAGE('nopeList'));
      expect(bodyOf(hidden).errors?.[0]?.extensions.code).toBe(
        bodyOf(unknown).errors?.[0]?.extensions.code,
      );
      expect(bodyOf(hidden).data).toBeUndefined();
    });

    it('the whole error array is identical for a hidden and an unknown field, anonymous and by role', async () => {
      const HIDDEN = 'articleList';
      const UNKNOWN = 'zzzzzzzzzzz';
      expect(UNKNOWN).toHaveLength(HIDDEN.length);
      const queries = (name: string) => [
        `{ ${name} { __typename } __typename(x: 1) }`,
        `{ ${name}(bogus: 1) { nope } } fragment Unused on Query { __typename }`,
        `{ ${name} { meta { total } } other: ${name} { data { title } } }`,
      ];
      const shapeOf = (res: request.Response, name: string) => ({
        status: res.status,
        errors: (bodyOf(res).errors ?? []).map((error) => ({
          ...error,
          message: error.message.replaceAll(name, 'NAME'),
          extensions: { code: error.extensions.code },
        })),
        data: bodyOf(res).data,
      });
      await setPermissions(publicRoleId, [{ subject: 'note', action: 'read' }]);
      try {
        for (const headers of [() => asAnonymous(), () => bearer(guest)]) {
          for (const [i, hiddenQuery] of queries(HIDDEN).entries()) {
            const hidden = await gql(hiddenQuery, { headers: headers() });
            const unknown = await gql(queries(UNKNOWN)[i] ?? '', {
              headers: headers(),
            });
            expect(bodyOf(hidden).errors?.length).toBeGreaterThan(0);
            expect(shapeOf(hidden, HIDDEN)).toEqual(shapeOf(unknown, UNKNOWN));
          }
        }
      } finally {
        await setPermissions(publicRoleId, [{ subject: '*', action: 'read' }]);
      }
    });

    it('hidden type names (fragments, variable types, component types) answer like unknown ones', async () => {
      const queries = (root: string, component: string) => [
        `{ ... on ${root} { __typename } }`,
        `query ($f: ${root}Filter, $s: [${root}Sort!]) { __typename }`,
        `fragment F on ${component} { name } { __typename ...F }`,
        `{ __type(name: "${root}") { name } }`,
      ];
      const shapeOf = (res: request.Response, root: string, comp: string) =>
        JSON.stringify({
          status: res.status,
          body: {
            ...bodyOf(res),
            errors: (bodyOf(res).errors ?? []).map((error) => ({
              ...error,
              // A hint depends on how similar the typed name is to visible
              // names (never on whether it exists), so it is not compared.
              message: error.message
                .replace(/ Did you mean.*$/, '')
                .replaceAll(comp, 'COMP')
                .replaceAll(root, 'ROOT'),
              extensions: { code: error.extensions.code },
            })),
          },
        });
      await setPermissions(publicRoleId, [{ subject: 'note', action: 'read' }]);
      try {
        for (const headers of [() => asAnonymous(), () => bearer(guest)]) {
          const hidden = queries('Article', 'Article_Reference');
          const unknown = queries('Zzzzzzz', 'Zzzzzzz_Zzzzzzzzz');
          for (const [i, query] of hidden.entries()) {
            const a = await gql(query, { headers: headers() });
            const b = await gql(unknown[i] ?? '', { headers: headers() });
            expect(shapeOf(a, 'Article', 'Article_Reference')).toBe(
              shapeOf(b, 'Zzzzzzz', 'Zzzzzzz_Zzzzzzzzz'),
            );
          }
          const first = await gql(hidden[0] ?? '', { headers: headers() });
          expect(bodyOf(first).errors?.length).toBeGreaterThan(0);
        }
      } finally {
        await setPermissions(publicRoleId, [{ subject: '*', action: 'read' }]);
      }
    });

    it('arguments of a hidden field do not reveal it, and no hint names it', async () => {
      const probe = await gql('{ articleList(bogus: 1) { nope } }', {
        headers: bearer(guest),
      });
      expect(bodyOf(probe).errors).toHaveLength(1);
      expect(bodyOf(probe).errors?.[0]?.message).toBe(MESSAGE('articleList'));
      const typo = await gql('{ articleLis { meta { total } } }', {
        headers: bearer(guest),
      });
      expect(bodyOf(typo).errors?.[0]?.message).toBe(MESSAGE('articleLis'));
    });

    it('a token scope without the type hides it; a creator who lost read hides it', async () => {
      const other = await apiToken([{ subject: 'note', action: 'read' }]);
      const scoped = await gql('{ articleList { meta { total } } }', {
        headers: bearer(other),
      });
      expect(bodyOf(scoped).errors?.[0]?.message).toBe(MESSAGE('articleList'));
      const note = await gql('{ noteList { data { text } } }', {
        headers: bearer(other),
      });
      expect(note.status).toBe(200);

      const roleId = await customRole('token-makers', 22, [
        { subject: 'article', action: 'read' },
        { subject: 'api_tokens', action: 'create' },
      ]);
      const maker = await signedIn('token-makers');
      const created = await http()
        .post(TOKENS)
        .set(bearer(maker))
        .send({
          name: 'gq2-maker',
          scope: { permissions: [{ subject: 'article', action: 'read' }] },
        });
      expect(created.status).toBe(201);
      const token = (created.body as { token: string }).token;
      const before = await gql('{ articleList { meta { total } } }', {
        headers: bearer(token),
      });
      expect(before.status).toBe(200);
      await setPermissions(roleId, [
        { subject: 'api_tokens', action: 'create' },
      ]);
      const after = await gql('{ articleList { meta { total } } }', {
        headers: bearer(token),
      });
      expect(after.status).toBe(400);
      expect(bodyOf(after).errors?.[0]?.message).toBe(MESSAGE('articleList'));
    });
  });

  describe('transport', () => {
    it('a present but invalid credential is 401 in the REST error shape', async () => {
      for (const header of ['Bearer not.a.jwt', 'Bearer ak_live_unknown']) {
        const res = await gql('{ articleList { meta { total } } }', {
          headers: { Authorization: header, 'X-Forwarded-For': nextIp() },
        });
        expect(res.status).toBe(401);
        expect(res.body).toMatchObject({
          statusCode: 401,
          errorCode: expect.any(String) as string,
        });
      }
    });

    it('requires a JSON object body with a query: 415, 400', async () => {
      const text = await http()
        .post(GRAPHQL)
        .set(asAnonymous())
        .set('Content-Type', 'text/plain')
        .send('{ articleList { meta { total } } }');
      expect(text.status).toBe(415);
      const batch = await http()
        .post(GRAPHQL)
        .set(asAnonymous())
        .send([{ query: '{ articleList { meta { total } } }' }]);
      expect(batch.status).toBe(400);
      const missing = await http().post(GRAPHQL).set(asAnonymous()).send({});
      expect(missing.status).toBe(400);
      expect((missing.body as { errorCode: string }).errorCode).toBe(
        'ACCESS_INVALID_REQUEST',
      );
      expect((await http().get(GRAPHQL).set(asAnonymous())).status).toBe(404);
    });

    it('rejects a mutation without running anything', async () => {
      const res = await gql('mutation { x }');
      expect(res.status).toBe(400);
      expect(bodyOf(res).data).toBeUndefined();
    });

    it('answers the 121st anonymous request from one IP with 429, and counts a request once', async () => {
      const headers = { 'X-Forwarded-For': nextIp() };
      const query =
        '{ articleList(pageSize: 1) { meta { total } } noteList(pageSize: 1) { meta { total } } }';
      for (let i = 0; i < 120; i += 1) {
        expect((await gql(query, { headers })).status).toBe(200);
      }
      const limited = await gql(query, { headers });
      expect(limited.status).toBe(429);
      expect(limited.headers['retry-after']).toBeDefined();
      expect((limited.body as { errorCode: string }).errorCode).toBe(
        'TOO_MANY_REQUESTS',
      );
    });

    it('does not count signed-in requests', async () => {
      const headers = { ...bearer(editor), 'X-Forwarded-For': nextIp() };
      for (let i = 0; i < 125; i += 1) {
        expect(
          (
            await gql('{ articleList(pageSize: 1) { meta { total } } }', {
              headers,
            })
          ).status,
        ).toBe(200);
      }
    });
  });
});
