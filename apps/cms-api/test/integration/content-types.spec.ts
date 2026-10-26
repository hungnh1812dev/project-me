import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import {
  openPrisma,
  type PrismaHandle,
} from '../../src/infrastructure/database/PrismaClient.adapter';
import { ContentRegistry } from '../../src/modules/content-engine/application/ContentRegistry.service';
import { ContentTypeRegistry } from '../../src/modules/content-engine/domain/ContentTypeRegistry.entity';
import {
  CONTENT_TYPES_ERROR_CODES,
  type ContentTypeView,
  type FieldView,
} from '../../src/modules/content-types/domain/ContentTypeView.rules';
import { hashPassword } from '../../src/modules/identity/application/Password.service';
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
import { startPostgres, type TestPostgres } from '../fixtures/postgres.fixture';
import { createTestApp } from '../fixtures/test-app';
import {
  seedRolePermissions,
  seedSystemRoles,
} from '../fixtures/access.fixture';

const PASSWORD = 'correct horse battery staple';
const CONTENT_TYPES = '/api/v1/content-types';
const ROLES = '/api/v1/roles';
const LOGIN = '/api/v1/auth/login';
const OCTET_RANGE = 250;

const SYSTEM_PATHS = ['createdBy', 'updatedBy', 'documentId'];
const ALL_ARTICLE_PATHS = [
  'title',
  'body',
  'priority',
  'score',
  'featured',
  'releaseDate',
  'releasedAt',
  'meta',
  'reference',
  'reference.name',
  'reference.phone',
  ...SYSTEM_PATHS,
];

let ipCounter = 0;
function nextIp(): string {
  ipCounter += 1;
  return `10.3.${Math.floor(ipCounter / OCTET_RANGE)}.${(ipCounter % OCTET_RANGE) + 1}`;
}

const pathsOf = (view: ContentTypeView) => view.fields.map((f) => f.path);
const field = (view: ContentTypeView, path: string): FieldView | undefined =>
  view.fields.find((f) => f.path === path);

describe('content types API (T17b; Postgres 16 via Testcontainers)', () => {
  let postgres: TestPostgres;
  let app: NestExpressApplication;
  let db: PrismaHandle;
  let accountCount = 0;
  let owner: string;
  let editor: string;
  let guest: string;
  /** Custom role: `roles:read/update`, no content rights at all. */
  let roleManager: string;
  /** Custom role: reads `article` title + reference.phone only. */
  let narrowReader: string;

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
    owner = await signedIn('owner');
    editor = await signedIn('editor');
    guest = await signedIn('guest');
    await customRole('role-managers', 30, [
      { subject: 'roles', action: 'read' },
      { subject: 'roles', action: 'update' },
    ]);
    roleManager = await signedIn('role-managers');
    await customRole('narrow-readers', 20, [
      {
        subject: 'article',
        action: 'read',
        readableFields: ['title', 'reference.phone'],
      },
    ]);
    narrowReader = await signedIn('narrow-readers');
  });

  afterAll(async () => {
    await app?.close();
    await db?.close();
    await postgres?.stop();
  });

  const http = () => request(app.getHttpServer());
  const bearer = (token: string) => ({
    Authorization: `Bearer ${token}`,
    'X-Forwarded-For': nextIp(),
  });

  async function signedIn(roleSlug: string): Promise<string> {
    accountCount += 1;
    const email = `t17b-user${accountCount}@example.test`;
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
    permissions: Record<string, unknown>[],
  ) {
    const created = await http()
      .post(ROLES)
      .set(bearer(owner))
      .send({ slug, name: slug, rank });
    expect(created.status).toBe(201);
    const id = (created.body as { id: string }).id;
    const put = await http()
      .put(`${ROLES}/${id}/permissions`)
      .set(bearer(owner))
      .send({ permissions });
    expect(put.status).toBe(200);
  }

  async function list(token: string): Promise<ContentTypeView[]> {
    const res = await http().get(CONTENT_TYPES).set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toContain('no-store');
    return (res.body as { data: ContentTypeView[] }).data;
  }

  async function getOne(token: string, slug: string) {
    return http()
      .get(`${CONTENT_TYPES}/${encodeURIComponent(slug)}`)
      .set(bearer(token));
  }

  it('requires a signed-in account', async () => {
    const res = await http()
      .get(CONTENT_TYPES)
      .set('X-Forwarded-For', nextIp());
    expect(res.status).toBe(401);
    const one = await http()
      .get(`${CONTENT_TYPES}/article`)
      .set('X-Forwarded-For', nextIp());
    expect(one.status).toBe(401);
  });

  it('gives the owner every type with every field, sorted by slug', async () => {
    const types = await list(owner);
    expect(types.map((t) => t.slug)).toEqual(['article', 'note']);
    const [article, note] = types as [ContentTypeView, ContentTypeView];
    expect(article).toMatchObject({
      slug: 'article',
      kind: 'collection',
      draftAndPublish: true,
    });
    expect(pathsOf(article)).toEqual(ALL_ARTICLE_PATHS);
    expect(pathsOf(note)).toEqual(['text', ...SYSTEM_PATHS]);
  });

  it('describes fields: component, nesting, root scalars and condition kinds', async () => {
    const res = await getOne(owner, 'article');
    expect(res.status).toBe(200);
    const article = res.body as ContentTypeView;
    expect(field(article, 'title')).toEqual({
      path: 'title',
      type: 'string',
      system: false,
      component: false,
      repeatable: false,
      rootScalar: true,
      conditionKind: 'string',
      sensitive: false,
    });
    expect(field(article, 'priority')?.conditionKind).toBe('integer');
    // json is scalar but never comparable in a condition
    expect(field(article, 'meta')).toMatchObject({
      rootScalar: true,
      conditionKind: null,
    });
    expect(field(article, 'reference')).toMatchObject({
      type: 'component',
      component: true,
      repeatable: false,
      rootScalar: false,
      conditionKind: null,
    });
    expect(field(article, 'reference.phone')).toMatchObject({
      type: 'string',
      component: false,
      rootScalar: false,
      conditionKind: null,
    });
    expect(field(article, 'createdBy')).toEqual({
      path: 'createdBy',
      type: 'integer',
      system: true,
      component: false,
      repeatable: false,
      rootScalar: true,
      conditionKind: 'integer',
      sensitive: false,
    });
    expect(field(article, 'documentId')?.conditionKind).toBe('uuid');
  });

  it('gives the editor (content `*` read, all fields) every type', async () => {
    const types = await list(editor);
    expect(types.map((t) => t.slug)).toEqual(['article', 'note']);
    expect(pathsOf(types[0] as ContentTypeView)).toEqual(ALL_ARTICLE_PATHS);
  });

  it('gives a role manager the full catalog even without any content read', async () => {
    const types = await list(roleManager);
    expect(types.map((t) => t.slug)).toEqual(['article', 'note']);
    expect(pathsOf(types[0] as ContentTypeView)).toEqual(ALL_ARTICLE_PATHS);
    const one = await getOne(roleManager, 'note');
    expect(one.status).toBe(200);
  });

  it('filters types and fields to what the caller can read', async () => {
    const types = await list(narrowReader);
    expect(types.map((t) => t.slug)).toEqual(['article']);
    // reference stays (it reaches reference.phone); reference.name does not
    expect(pathsOf(types[0] as ContentTypeView)).toEqual([
      'title',
      'reference',
      'reference.phone',
      ...SYSTEM_PATHS,
    ]);
  });

  it('gives a role with no content read an empty list', async () => {
    expect(await list(guest)).toEqual([]);
  });

  it('answers the same 404 for an unknown type and an unreadable one', async () => {
    const responses = [
      await getOne(owner, 'missing'),
      await getOne(owner, '__proto__'),
      await getOne(owner, "article'; drop table x"),
      await getOne(narrowReader, 'note'),
      await getOne(guest, 'article'),
    ];
    for (const res of responses) {
      expect(res.status).toBe(404);
      expect((res.body as { errorCode?: unknown }).errorCode).toBe(
        CONTENT_TYPES_ERROR_CODES.NOT_FOUND,
      );
    }
    const messages = new Set(
      responses.map((res) => (res.body as { message: string }).message),
    );
    expect(messages.size).toBe(1);
  });
});
