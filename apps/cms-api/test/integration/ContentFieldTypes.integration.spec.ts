import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Kysely } from 'kysely';
import { Client } from 'pg';
import request from 'supertest';

import {
  openPrisma,
  type PrismaHandle,
} from '../../src/infrastructure/database/PrismaClient.adapter';
import { MASK_SENTINEL } from '../../src/modules/access/domain/Access.constants';
import { createContentDb } from '../../src/modules/content-engine/adapters/ContentDatabase.adapter';
import type { ContentDatabase } from '../../src/modules/content-engine/adapters/TreeLoader.adapter';
import { ContentRegistry } from '../../src/modules/content-engine/application/ContentRegistry.service';
import { ContentTypeRegistry } from '../../src/modules/content-engine/domain/ContentTypeRegistry.entity';
import {
  emptySnapshot,
  planMigration,
} from '../../src/modules/content-engine/domain/SqlGenerator.rules';
import { hashPassword } from '../../src/modules/identity/application/Password.service';
import { seedRolePermissions, seedSystemRoles } from '../fixtures/Access.fixture';
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

const PASSWORD = 'correct horse battery staple';
const API = '/api/v1';
const DOCUMENTS = `${API}/documents/probe`;
const GRAPHQL = `${API}/graphql`;
const OWNER_EMAIL = 'field-types-owner@example.test';
const OCTET_RANGE = 250;
const PAST_2_POW_53 = '9007199254740993';

const PROBE_DEFINITION = {
  slug: 'probe',
  displayName: 'Probe',
  kind: 'collection',
  draftAndPublish: false,
  fields: [
    { name: 'big', type: 'biginteger' },
    { name: 'ratio', type: 'float' },
    { name: 'precise', type: 'double' },
    { name: 'count', type: 'integer', unsigned: true },
    { name: 'at', type: 'time' },
    { name: 'level', type: 'enumeration', options: ['low', 'high'], sensitive: true },
  ],
} as const;

const VALID_VALUES = {
  big: PAST_2_POW_53,
  ratio: 1.5,
  precise: 2.25,
  count: 7,
  at: '14:30:00',
  level: 'high',
};

let ipCounter = 0;
const nextIp = () =>
  `10.6.${Math.floor(ipCounter / OCTET_RANGE)}.${(ipCounter += 1) % OCTET_RANGE}`;

interface Doc {
  documentId: string;
  values: Record<string, unknown>;
}
interface Failure {
  errorCode: string;
  message: string;
}

describe('new content field types over REST and GraphQL (SBF-2; Postgres 17 via Testcontainers)', () => {
  let postgres: TestPostgres;
  let app: NestExpressApplication;
  let db: PrismaHandle;
  let content: Kysely<ContentDatabase>;
  let owner: string;

  beforeAll(async () => {
    postgres = await startPostgres();
    const template = await createCoreTemplate(postgres.getConnectionUri());
    const databaseUrl = await template.fresh();
    db = openPrisma(databaseUrl);
    await seedSystemRoles(db.prisma);
    await seedRolePermissions(db.prisma);

    const registry = ContentTypeRegistry.fromDefinitions([PROBE_DEFINITION]);
    const definitions = registry.slugs().map((slug) => registry.resolve(slug).definition);
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query(planMigration(emptySnapshot(), definitions).statements.join('\n'));
    await client.end();
    content = createContentDb(databaseUrl);

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
      [{ token: ContentRegistry, value: { registry: () => Promise.resolve(registry) } }],
    );
    await db.prisma.account.create({
      data: {
        email: OWNER_EMAIL,
        displayName: 'Owner',
        passwordHash: await hashPassword(PASSWORD),
        status: 'active',
        role: { connect: { slug: 'owner' } },
      },
    });
    const login = await http()
      .post(`${API}/auth/login`)
      .set({ 'X-Forwarded-For': nextIp() })
      .send({ email: OWNER_EMAIL, password: PASSWORD });
    owner = (login.body as { accessToken: string }).accessToken;

    const roles = await db.prisma.role.findMany({ select: { slug: true, documentId: true } });
    const publicRoleId = roles.find((role) => role.slug === 'public')?.documentId ?? '';
    const granted = await http()
      .put(`${API}/roles/${publicRoleId}/permissions`)
      .set(asOwner())
      .send({
        permissions: [
          {
            subject: 'probe',
            action: 'read',
            readableFields: ['big', 'ratio', 'precise', 'count', 'at'],
          },
        ],
      });
    if (granted.status !== 200) throw new Error(`public grant failed: ${granted.status}`);
  });

  afterAll(async () => {
    await app?.close();
    await content?.destroy();
    await db?.close();
    await postgres?.stop();
  });

  const http = () => request(app.getHttpServer());
  const asOwner = () => ({ Authorization: `Bearer ${owner}`, 'X-Forwarded-For': nextIp() });
  const create = (values: Record<string, unknown>) =>
    http().post(DOCUMENTS).set(asOwner()).send({ values });

  it('saves and reads back every new type over REST, keeping big integer digits', async () => {
    const created = await create(VALID_VALUES);
    expect(created.status).toBe(201);
    const read = await http()
      .get(`${DOCUMENTS}/${(created.body as Doc).documentId}`)
      .set(asOwner());
    expect(read.status).toBe(200);
    expect((read.body as Doc).values).toMatchObject(VALID_VALUES);
  });

  it('reads the same values over GraphQL', async () => {
    const res = await http()
      .post(GRAPHQL)
      .set(asOwner())
      .send({ query: '{ probeList { data { big ratio precise count at level } } }' });
    expect(res.status).toBe(200);
    const body = res.body as { data: { probeList: { data: Record<string, unknown>[] } } };
    expect(body.data.probeList.data[0]).toMatchObject(VALID_VALUES);
  });

  it('shows a masked enumeration as the sentinel to the public role', async () => {
    const res = await http().get(DOCUMENTS).set({ 'X-Forwarded-For': nextIp() });
    expect(res.status).toBe(200);
    const [record] = (res.body as { data: Doc[] }).data;
    expect(record?.values.level).toBe(MASK_SENTINEL);
  });

  it.each([
    ['a negative unsigned integer', 'count', -1],
    ['a value outside the options', 'level', 'medium'],
    ['a big integer with non-digits', 'big', '12ab'],
    ['a time past 24:00', 'at', '25:00'],
  ])('refuses %s with 400 naming the field', async (_label, field, value) => {
    const res = await create({ ...VALID_VALUES, [field]: value });
    expect(res.status).toBe(400);
    expect((res.body as Failure).errorCode).toBe('DOCUMENT_INVALID');
    expect((res.body as Failure).message).toContain(field);
  });

  it('lists options on an enumeration field of the content type view only', async () => {
    const res = await http().get(`${API}/content-types/probe`).set(asOwner());
    expect(res.status).toBe(200);
    const view = res.body as { fields: { path: string; options?: string[] }[] };
    const fields = view.fields;
    expect(fields.find((field) => field.path === 'level')?.options).toEqual(['low', 'high']);
    expect(fields.find((field) => field.path === 'count')).not.toHaveProperty('options');
    expect(fields.find((field) => field.path === 'count')).not.toHaveProperty('unsigned');
  });
});
