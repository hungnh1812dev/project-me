import { randomUUID } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Kysely } from 'kysely';
import { Client } from 'pg';
import request from 'supertest';

import { inContentUnit } from '../fixtures/ContentUnit.fixture';
import {
  openPrisma,
  type PrismaHandle,
} from '../../src/infrastructure/database/PrismaClient.adapter';
import { MASKED_FIELDS_KEY } from '../../src/modules/access/domain/Access.constants';
import { createContentDb } from '../../src/modules/content-engine/adapters/ContentDatabase.adapter';
import { ContentRegistry } from '../../src/modules/content-engine/application/ContentRegistry.service';
import { KyselyContentRepository } from '../../src/modules/content-engine/adapters/KyselyContent.repository';
import { ContentTypeRegistry } from '../../src/modules/content-engine/domain/ContentTypeRegistry.entity';
import {
  emptySnapshot,
  planMigration,
} from '../../src/modules/content-engine/domain/SqlGenerator.rules';
import type { ContentDatabase } from '../../src/modules/content-engine/adapters/TreeLoader.adapter';
import { hashPassword } from '../../src/modules/identity/application/Password.service';
import {
  ARTICLE_DEFINITION,
  NOTE_DEFINITION,
} from '../fixtures/Access.fixture';
import { createCoreTemplate } from '../fixtures/CoreDb.fixture';
import {
  dbEnvOf,
  devEnv,
  TEST_ADMIN_ORIGIN,
  TEST_JWT_KID,
  TEST_SECRET_32_BYTES,
  TEST_WEB_ORIGIN,
} from '../fixtures/Env.fixture';
import { startPostgres, type TestPostgres } from '../fixtures/Postgres.fixture';
import { createTestApp } from '../fixtures/TestApp.fixture';
import {
  seedRolePermissions,
  seedSystemRoles,
} from '../fixtures/Access.fixture';

const PASSWORD = 'correct horse battery staple';
const DOCUMENTS = '/api/v1/documents';
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

describe('document read API (T20; Postgres 17 via Testcontainers)', () => {
  let postgres: TestPostgres;
  let app: NestExpressApplication;
  let db: PrismaHandle;
  let content: Kysely<ContentDatabase>;
  let accountCount = 0;
  let owner: string;
  let editor: string;
  let noAccess: string;
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

    const registry = ContentTypeRegistry.fromDefinitions([
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
    const repository = new KyselyContentRepository(registry);
    await inContentUnit(content, async (unit) => {
      for (const seed of SEEDS) {
        await repository.insertTree(unit, 'article', {
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
      await repository.insertTree(unit, 'note', {
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
          token: ContentRegistry,
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
    await customRole('no-access', 15, []);
    noAccess = await signedIn('no-access');
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
    const email = `t20-user${accountCount}@example.test`;
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
  ) {
    const created = await http()
      .post(ROLES)
      .set(bearer(owner))
      .send({ slug, name: slug, rank });
    expect(created.status).toBe(201);
    await setPermissions((created.body as { id: string }).id, permissions);
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
      .send({ name: 't20', scope: { permissions: scope } });
    expect(res.status).toBe(201);
    return (res.body as { token: string }).token;
  }

  const list = (query: string, headers: JsonObject = asAnonymous()) =>
    http()
      .get(`${DOCUMENTS}/article${query}`)
      .set(headers as Record<string, string>);
  const titles = (res: request.Response) =>
    (res.body as Page).data.map((r) => r.values.title);
  const code = (res: request.Response) =>
    (res.body as { errorCode: string }).errorCode;

  describe('anonymous (public role), published only', () => {
    it('lists published rows with meta, no drafts, no account references', async () => {
      const res = await list('?sort=title');
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toContain('no-store');
      expect(titles(res)).toEqual([
        'Alpha',
        'Beta 100% real',
        'Delta',
        'Gamma',
      ]);
      const page = res.body as Page;
      expect(page.meta).toEqual({ page: 1, pageSize: 20, total: 4 });
      expect(page.data[0]).not.toHaveProperty('createdBy');
      expect(page.data[0]).not.toHaveProperty('updatedBy');
      expect(page.data[0]?.[MASKED_FIELDS_KEY]).toEqual([]);
    });

    it('returns date columns as YYYY-MM-DD strings and decimals as strings', async () => {
      const page = (await list('?sort=releaseDate')).body as Page;
      expect(page.data.map((r) => r.values.releaseDate)).toEqual([
        '2026-01-15',
        '2026-02-10',
        '2026-03-01',
        '2026-04-01',
      ]);
      expect(page.data[0]?.values.score).toBe('20.00');
    });

    it('refuses drafts (403) and still allows the published list', async () => {
      const res = await list('?status=draft');
      expect(res.status).toBe(403);
      expect((await list('?status=published')).status).toBe(200);
    });

    it('reads a type without draft and publish as live', async () => {
      const res = await http().get(`${DOCUMENTS}/note`).set(asAnonymous());
      expect(res.status).toBe(200);
      expect((res.body as Page).data[0]?.values.text).toBe('a live note');
    });

    it('404 for an unknown slug, 400 for a bad document id', async () => {
      const unknown = await http().get(`${DOCUMENTS}/nope`).set(asAnonymous());
      expect(unknown.status).toBe(404);
      const bad = await http()
        .get(`${DOCUMENTS}/article/not-a-uuid`)
        .set(asAnonymous());
      expect(bad.status).toBe(400);
    });

    it('a malformed Authorization header is 401, never a public read', async () => {
      for (const header of ['Bearer', 'Bearer not.a.jwt', 'Basic abc', '']) {
        const res = await list('', {
          Authorization: header,
          'X-Forwarded-For': nextIp(),
        });
        expect(res.status).toBe(401);
      }
      const token = await list('', bearer('ak_live_unknown'));
      expect(token.status).toBe(401);
    });

    it('fails closed when the public role has no read row', async () => {
      await setPermissions(publicRoleId, []);
      expect((await list('')).status).toBe(403);
      await setPermissions(publicRoleId, [{ subject: '*', action: 'read' }]);
      expect((await list('')).status).toBe(200);
    });
  });

  describe('anonymous throttle (120 per minute per IP)', () => {
    it('answers the 121st anonymous read from one IP with 429 and Retry-After', async () => {
      const ip = { 'X-Forwarded-For': nextIp() };
      for (let i = 0; i < 120; i += 1) {
        const res = await list('?pageSize=1', ip);
        expect(res.status).toBe(200);
      }
      const limited = await list('?pageSize=1', ip);
      expect(limited.status).toBe(429);
      expect(limited.headers['retry-after']).toBeDefined();
      expect(code(limited)).toBe('TOO_MANY_REQUESTS');
      const detail = await http()
        .get(`${DOCUMENTS}/article/${ids.alpha}`)
        .set(ip);
      expect(detail.status).toBe(429);
    });

    it('does not count signed-in reads, even from the throttled IP', async () => {
      const ip = { 'X-Forwarded-For': nextIp() };
      for (let i = 0; i < 125; i += 1) {
        const res = await list('?pageSize=1', {
          ...ip,
          Authorization: `Bearer ${editor}`,
        });
        expect(res.status).toBe(200);
      }
      expect((await list('?pageSize=1', ip)).status).toBe(200);
    });
  });

  describe('pagination and sorting', () => {
    it('pages with page and pageSize and keeps the total', async () => {
      const first = (await list('?sort=title&pageSize=3&page=1')).body as Page;
      const second = (await list('?sort=title&pageSize=3&page=2')).body as Page;
      expect(first.data.map((r) => r.values.title)).toEqual([
        'Alpha',
        'Beta 100% real',
        'Delta',
      ]);
      expect(second.data.map((r) => r.values.title)).toEqual(['Gamma']);
      expect(second.meta).toEqual({ page: 2, pageSize: 3, total: 4 });
      const beyond = (await list('?pageSize=3&page=9')).body as Page;
      expect(beyond.data).toEqual([]);
      expect(beyond.meta.total).toBe(4);
    });

    it('sorts descending with a minus and by several keys', async () => {
      expect(titles(await list('?sort=-priority'))).toEqual([
        'Delta',
        'Alpha',
        'Gamma',
        'Beta 100% real',
      ]);
      expect(titles(await list('?sort=featured,-priority'))).toEqual([
        'Delta',
        'Beta 100% real',
        'Alpha',
        'Gamma',
      ]);
    });

    it.each([
      '?page=0',
      '?pageSize=101',
      '?pageSize=abc',
      '?page=1.5',
      '?sort=',
      '?sort=a,a',
      '?sort=a,b,c,d',
      '?unknown=1',
      '?status=archived',
      '?page=1&page=2',
    ])('rejects %s with 400', async (query) => {
      expect((await list(query)).status).toBe(400);
    });
  });

  describe('filters', () => {
    it.each([
      ['?filter[title]=Alpha', ['Alpha']],
      ['?filter[title][eq]=Alpha', ['Alpha']],
      [
        '?filter[title][ne]=Alpha&sort=title',
        ['Beta 100% real', 'Delta', 'Gamma'],
      ],
      ['?filter[priority][gte]=3&sort=title', ['Alpha', 'Delta']],
      ['?filter[priority][lt]=2', ['Beta 100% real']],
      [
        '?filter[priority][in]=1&filter[priority][in]=2&sort=title',
        ['Beta 100% real', 'Gamma'],
      ],
      ['?filter[featured]=true&sort=title', ['Alpha', 'Gamma']],
      ['?filter[score][gt]=3.25&sort=title', ['Beta 100% real', 'Delta']],
      ['?filter[releaseDate][gte]=2026-03-01&sort=title', ['Alpha', 'Delta']],
      ['?filter[releasedAt][lt]=2026-02-01T00:00:00Z', ['Beta 100% real']],
      ['?filter[title][contains]=ALP', ['Alpha']],
      ['?filter[title][contains]=100%25', ['Beta 100% real']],
      ['?filter[title][contains]=%25', ['Beta 100% real']],
      ['?filter[title][contains]=_lpha', []],
      [`?filter[documentId]=${ids.gamma}`, ['Gamma']],
      ['?filter[title]=x%27%3B%20drop%20table%20article%3B--', []],
    ])('%s', async (query, expected) => {
      const res = await list(query);
      expect(res.status).toBe(200);
      expect(titles(res)).toEqual(expected);
      expect((res.body as Page).meta.total).toBe(expected.length);
    });

    it.each([
      ['an unknown field', '?filter[nope]=1', 'FIELD_UNKNOWN'],
      ['a json field', '?filter[meta]=x', 'BAD_REQUEST'],
      ['a component field', '?filter[reference]=x', 'BAD_REQUEST'],
      ['a nested field', '?filter[reference.name]=Ann', 'BAD_REQUEST'],
      [
        'createdBy for an anonymous actor',
        '?filter[createdBy]=1',
        'FIELD_NOT_READABLE',
      ],
      [
        'sort by createdBy for an anonymous actor',
        '?sort=createdBy',
        'FIELD_NOT_READABLE',
      ],
      [
        'an integer out of range',
        '?filter[priority]=99999999999',
        'BAD_REQUEST',
      ],
      ['a non-integer', '?filter[priority]=abc', 'BAD_REQUEST'],
      ['an impossible date', '?filter[releaseDate]=2026-02-31', 'BAD_REQUEST'],
      ['year zero', '?filter[releasedAt]=0000-01-01T00:00:00Z', 'BAD_REQUEST'],
      [
        'contains on an integer',
        '?filter[priority][contains]=1',
        'BAD_REQUEST',
      ],
      [
        'an ordering operator on a boolean',
        '?filter[featured][gt]=true',
        'BAD_REQUEST',
      ],
      [
        'an unknown operator',
        '?filter[title][like]=a',
        'ACCESS_INVALID_REQUEST',
      ],
      ['a malformed key', '?filter[title=a', 'ACCESS_INVALID_REQUEST'],
      [
        'two values for eq',
        '?filter[title]=a&filter[title]=b',
        'ACCESS_INVALID_REQUEST',
      ],
    ])('rejects %s with 400', async (_name, query, errorCode) => {
      const res = await list(query);
      expect(res.status).toBe(400);
      expect(code(res)).toBe(errorCode);
    });

    it('lets signed-in accounts filter and sort by createdBy', async () => {
      const res = await list(
        `?filter[createdBy]=${CREATOR_ID}&sort=createdBy`,
        bearer(editor),
      );
      expect(res.status).toBe(200);
      expect((res.body as Page).meta.total).toBe(4);
      expect((res.body as Page).data[0]?.createdBy).toBe(CREATOR_ID);
    });
  });

  describe('signed-in accounts', () => {
    it('editor reads drafts; the draft list has its own rows', async () => {
      const res = await list('?status=draft&sort=title', bearer(editor));
      expect(res.status).toBe(200);
      expect(titles(res)).toEqual(['Delta DRAFT', 'Only a draft']);
    });

    it('a role without read on the type gets 403', async () => {
      expect((await list('', bearer(noAccess))).status).toBe(403);
    });

    it('masks unreadable fields and never sends their raw values', async () => {
      const res = await list('?sort=title', bearer(narrowReader));
      expect(res.status).toBe(200);
      const first = (res.body as Page).data[0];
      expect(first?.values.title).toBe('Alpha');
      expect(first?.values.body).toBe('***');
      expect(first?.values.priority).toBeNull();
      expect(first?.values.meta).toBeNull();
      expect(first?.components.reference?.[0]?.values).toEqual({
        name: 'Ann',
        phone: '***',
      });
      expect(first?.[MASKED_FIELDS_KEY]).toEqual(
        expect.arrayContaining(['body', 'priority', 'reference.phone']),
      );
      expect(JSON.stringify(res.body)).not.toContain('RAW');
      expect(JSON.stringify(res.body)).not.toContain('2026-03-01');
    });

    it('filter or sort on a masked field is 400 FIELD_NOT_READABLE', async () => {
      for (const query of [
        '?filter[priority]=3',
        '?filter[body][contains]=SECRET',
        '?sort=priority',
        '?sort=-score',
      ]) {
        const res = await list(query, bearer(narrowReader));
        expect(res.status).toBe(400);
        expect(code(res)).toBe('FIELD_NOT_READABLE');
      }
      expect(
        (await list('?filter[title]=Alpha', bearer(narrowReader))).status,
      ).toBe(200);
    });

    it('applies the role row conditions to list, total and detail', async () => {
      const res = await list('', bearer(priorityThree));
      expect(titles(res)).toEqual(['Alpha']);
      expect((res.body as Page).meta.total).toBe(1);
      const hidden = await http()
        .get(`${DOCUMENTS}/article/${ids.gamma}`)
        .set(bearer(priorityThree));
      expect(hidden.status).toBe(404);
      const shown = await http()
        .get(`${DOCUMENTS}/article/${ids.alpha}`)
        .set(bearer(priorityThree));
      expect(shown.status).toBe(200);
    });
  });

  describe('detail', () => {
    const detail = (id: string, query = '', headers = asAnonymous()) =>
      http().get(`${DOCUMENTS}/article/${id}${query}`).set(headers);

    it('returns the published row, masked like the list', async () => {
      const res = await detail(ids.alpha);
      expect(res.status).toBe(200);
      const body = res.body as DocRecord;
      expect(body.documentId).toBe(ids.alpha);
      expect(body.values.releaseDate).toBe('2026-03-01');
      expect(body.components.reference?.[0]?.values.phone).toBe(RAW_PHONE);
      const narrow = await detail(ids.alpha, '', bearer(narrowReader));
      expect(JSON.stringify(narrow.body)).not.toContain('RAW');
    });

    it('serves the draft and the published row of one document apart', async () => {
      const published = (await detail(ids.delta)).body as DocRecord;
      const draft = (await detail(ids.delta, '?status=draft', bearer(editor)))
        .body as DocRecord;
      expect(published.values.title).toBe('Delta');
      expect(draft.values.title).toBe('Delta DRAFT');
    });

    it('404 for a draft-only document read as published, 403 for drafts without rights', async () => {
      const res = await detail(ids.draftOnly);
      expect(res.status).toBe(404);
      expect(code(res)).toBe('DOCUMENT_NOT_FOUND');
      expect((await detail(ids.draftOnly, '?status=draft')).status).toBe(403);
      expect(
        (await detail(ids.draftOnly, '?status=draft', bearer(editor))).status,
      ).toBe(200);
      expect((await detail(randomUUID())).status).toBe(404);
    });
  });

  describe('API tokens', () => {
    it('reads with a token scope; drafts need read and update', async () => {
      const readOnly = await apiToken([{ subject: 'article', action: 'read' }]);
      const res = await list('?sort=title', bearer(readOnly));
      expect(res.status).toBe(200);
      expect((res.body as Page).data[0]?.createdBy).toBe(CREATOR_ID);
      expect((await list('?status=draft', bearer(readOnly))).status).toBe(403);

      const withUpdate = await apiToken([
        { subject: 'article', action: 'read' },
        { subject: 'article', action: 'update' },
      ]);
      expect((await list('?status=draft', bearer(withUpdate))).status).toBe(
        200,
      );
    });

    it('applies the token field scope and a scope without the type is 403', async () => {
      const narrow = await apiToken([
        { subject: 'article', action: 'read', readableFields: ['title'] },
      ]);
      const res = await list('?sort=title', bearer(narrow));
      expect((res.body as Page).data[0]?.values.body).toBe('***');
      expect(JSON.stringify(res.body)).not.toContain('RAW');
      expect((await list('?filter[priority]=1', bearer(narrow))).status).toBe(
        400,
      );
      const other = await apiToken([{ subject: 'note', action: 'read' }]);
      expect((await list('', bearer(other))).status).toBe(403);
    });
  });

  describe('public role field profile', () => {
    it('masks what the public role cannot read, for anonymous reads', async () => {
      await setPermissions(publicRoleId, [
        { subject: 'article', action: 'read', readableFields: ['title'] },
      ]);
      try {
        const res = await list('?sort=title');
        const first = (res.body as Page).data[0];
        expect(first?.values.title).toBe('Alpha');
        expect(first?.values.body).toBe('***');
        expect(first?.values.releaseDate).toBeNull();
        expect(JSON.stringify(res.body)).not.toContain('RAW');
        const probe = await list('?filter[priority]=3');
        expect(probe.status).toBe(400);
        expect(code(probe)).toBe('FIELD_NOT_READABLE');
      } finally {
        await setPermissions(publicRoleId, [{ subject: '*', action: 'read' }]);
      }
    });
  });
});
