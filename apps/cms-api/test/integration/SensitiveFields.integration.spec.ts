import { randomUUID } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Kysely } from 'kysely';
import request from 'supertest';

import { inContentUnit } from '../fixtures/ContentUnit.fixture';
import {
  openPrisma,
  type PrismaHandle,
} from '../../src/infrastructure/database/PrismaClient.adapter';
import {
  MASK_SENTINEL,
  MASKED_FIELDS_KEY,
} from '../../src/modules/access/domain/Access.constants';
import {
  TURNSTILE_VERIFIER,
  type TurnstileVerifier,
} from '../../src/modules/reviewer/application/Reviewer.port';
import { DEFAULT_CONTENT_PATHS } from '../../src/modules/content-engine/adapters/MigrationFiles.adapter';
import { createContentDb } from '../../src/modules/content-engine/adapters/ContentDatabase.adapter';
import { createMigrationDb } from '../../src/modules/content-engine/cli/ContentEngineCli.setup';
import { runContentMigrations } from '../../src/modules/content-engine/adapters/MigrationRunner.adapter';
import { ContentRegistry } from '../../src/modules/content-engine/application/ContentRegistry.service';
import { KyselyContentRepository } from '../../src/modules/content-engine/adapters/KyselyContent.repository';
import type { ContentTypeRegistry } from '../../src/modules/content-engine/domain/ContentTypeRegistry.entity';
import type { ContentDatabase } from '../../src/modules/content-engine/adapters/TreeLoader.adapter';
import { loadRegistryFromDatabase } from '../fixtures/ContentRegistry.fixture';
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
import { hashPassword } from '../../src/modules/identity/application/Password.service';

const PASSWORD = 'correct horse battery staple';
const API = '/api/v1';
const CONTACT = `${API}/documents/cv-contact`;
const RESUME = `${API}/documents/resume`;
const GRAPHQL = `${API}/graphql`;
const RAW = {
  phone: 'RAW-PHONE-5550100',
  email: 'RAW-EMAIL@example.com',
  address: 'RAW-ADDRESS-1',
  github: 'RAW-GITHUB',
  company: 'RAW-COMPANY',
  refereePhone: 'RAW-REFEREE-PHONE',
};
const VISIBLE = { name: 'Visible Name', linkedin: 'visible-linkedin' };
const MASKED_CONTACT_FIELDS = ['address', 'email', 'github', 'phone'];

let ipCounter = 0;
const nextIp = () => `10.51.0.${(ipCounter += 1)}`;

const verifier = {
  isConfigured: true,
  verify: () => Promise.resolve('passed' as const),
} satisfies TurnstileVerifier;

interface Page {
  data: {
    values: Record<string, unknown>;
    components: Record<string, { values: Record<string, unknown> }[]>;
    [MASKED_FIELDS_KEY]: string[];
  }[];
}

describe('sensitive fields start masked for public and reviewer (SPEC D2, RV-mask)', () => {
  let postgres: TestPostgres;
  let app: NestExpressApplication;
  let db: PrismaHandle;
  let content: Kysely<ContentDatabase>;

  beforeAll(async () => {
    postgres = await startPostgres();
    const template = await createCoreTemplate(postgres.getConnectionUri());
    const databaseUrl = await template.fresh();
    db = openPrisma(databaseUrl);
    await seedSystemRoles(db.prisma);
    await seedRolePermissions(db.prisma);

    const migrationDb = createMigrationDb(databaseUrl);
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
    content = createContentDb(databaseUrl);
    const repository = new KyselyContentRepository(registry);
    await inContentUnit(content, async (unit) => {
      await repository.insertTree(unit, 'cv-contact', {
        documentId: randomUUID(),
        publishedAt: new Date(),
        values: {
          ...VISIBLE,
          ...pick(RAW, ['phone', 'email', 'address', 'github']),
        },
        components: {},
      });
      await repository.insertTree(unit, 'resume', {
        documentId: randomUUID(),
        publishedAt: new Date(),
        values: { position: 'Engineer', isMain: true },
        components: {
          experiences: [
            {
              componentUid: randomUUID(),
              values: { company: RAW.company, location: 'Remote' },
              components: {},
            },
          ],
          referees: [
            {
              componentUid: randomUUID(),
              values: { name: 'Ref Name', phone: RAW.refereePhone },
              components: {},
            },
          ],
        },
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
        { token: TURNSTILE_VERIFIER, value: verifier },
      ],
    );
  });

  afterAll(async () => {
    await app?.close();
    await content?.destroy();
    await db?.close();
    await postgres?.stop();
  });

  const http = () => request(app.getHttpServer());
  const from = () => ({ 'X-Forwarded-For': nextIp() });
  const bearer = (token: string) => ({
    Authorization: `Bearer ${token}`,
    ...from(),
  });
  const expectNoRawValue = (body: unknown) => {
    for (const value of Object.values(RAW)) {
      expect(JSON.stringify(body)).not.toContain(value);
    }
  };

  let accountCount = 0;
  async function signedIn(roleSlug: string): Promise<string> {
    accountCount += 1;
    const email = `rv-mask-${accountCount}@example.test`;
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
      .post(`${API}/auth/login`)
      .set(from())
      .send({ email, password: PASSWORD });
    return (res.body as { accessToken: string }).accessToken;
  }

  async function reviewerToken(): Promise<string> {
    const owner = await signedIn('owner');
    const enabled = await http()
      .put(`${API}/reviewer/settings`)
      .set(bearer(owner))
      .send({ enabled: true });
    expect(enabled.status).toBe(200);
    const res = await http()
      .post(`${API}/reviewer/sessions`)
      .set(from())
      .send({
        visitorRole: 'Recruiter',
        purposeTags: ['hiring'],
        turnstileToken: 'token',
      });
    expect(res.status).toBe(201);
    return (res.body as { accessToken: string }).accessToken;
  }

  const contactOf = (token?: string) =>
    http()
      .get(`${CONTACT}?status=published`)
      .set(token === undefined ? from() : bearer(token));

  describe.each([
    ['an anonymous visitor', () => Promise.resolve(undefined)],
    ['a reviewer session', reviewerToken],
  ])('%s', (_label, tokenOf) => {
    let token: string | undefined;
    beforeAll(async () => {
      token = await tokenOf();
    });

    it('REST: cv-contact masks every sensitive field and sends no raw value', async () => {
      const res = await contactOf(token);
      expect(res.status).toBe(200);
      const [record] = (res.body as Page).data;
      expect(record?.values).toMatchObject(VISIBLE);
      expect(record?.values.phone).toBe('***');
      expect(record?.[MASKED_FIELDS_KEY]).toEqual(
        expect.arrayContaining(MASKED_CONTACT_FIELDS),
      );
      expectNoRawValue(res.body);
    });

    it('REST: resume masks experiences.company and referees.phone', async () => {
      const res = await http()
        .get(`${RESUME}?status=published`)
        .set(token === undefined ? from() : bearer(token));
      expect(res.status).toBe(200);
      const [record] = (res.body as Page).data;
      expect(record?.[MASKED_FIELDS_KEY]).toEqual(
        expect.arrayContaining(['experiences.company', 'referees.phone']),
      );
      expect(record?.components.experiences?.[0]?.values.location).toBe(
        'Remote',
      );
      expect(record?.components.referees?.[0]?.values.name).toBe('Ref Name');
      expectNoRawValue(res.body);
    });

    it('GraphQL: cvContact masks the same fields and sends no raw value', async () => {
      const res = await http()
        .post(GRAPHQL)
        .set(token === undefined ? from() : bearer(token))
        .send({
          query: '{ cvContact { name phone _maskedFields } }',
        });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        data: { cvContact: { name: VISIBLE.name, phone: MASK_SENTINEL } },
      });
      expect(
        (res.body as { data: { cvContact: Record<string, string[]> } }).data
          .cvContact[MASKED_FIELDS_KEY],
      ).toEqual(expect.arrayContaining(MASKED_CONTACT_FIELDS));
      expect(JSON.stringify(res.body)).toContain('phone');
      expectNoRawValue(res.body);
    });

    it('filter or sort on a sensitive field is 400 FIELD_NOT_READABLE', async () => {
      for (const query of [
        `?filter[phone]=${RAW.phone}`,
        '?sort=phone',
        `?filter[email][eq]=${RAW.email}`,
      ]) {
        const res = await http()
          .get(`${CONTACT}${query}`)
          .set(token === undefined ? from() : bearer(token));
        expect(res.status).toBe(400);
        expect(res.body).toMatchObject({ errorCode: 'FIELD_NOT_READABLE' });
        expectNoRawValue(res.body);
      }
    });
  });

  it('an editor (wildcard grant) still reads the raw values', async () => {
    const editor = await signedIn('editor');
    const res = await contactOf(editor);
    const [record] = (res.body as Page).data;
    expect(record?.values.phone).toBe(RAW.phone);
    expect(record?.[MASKED_FIELDS_KEY]).toEqual([]);
  });
});

function pick<T extends object, K extends keyof T>(source: T, keys: K[]) {
  return Object.fromEntries(keys.map((key) => [key, source[key]])) as Pick<
    T,
    K
  >;
}
