import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import {
  openPrisma,
  type PrismaHandle,
} from '../../src/infrastructure/database/PrismaClient.adapter';
import { hashPassword } from '../../src/modules/identity/application/Password.service';
import {
  seedRolePermissions,
  seedSystemRoles,
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

const PASSWORD = 'correct horse battery staple';
const REVIEWER = '/api/v1/reviewer';
const OWNER_EMAIL = 'rvoff-owner@example.test';
const FEATURE_OFF_CODE = 'REVIEWER_FEATURE_OFF';
const SESSION_BODY = {
  visitorRole: 'Recruiter',
  purposeTags: ['hiring'],
  turnstileToken: 'token',
};

describe('reviewer routes with REVIEWER_FEATURE_ENABLED=false (ADR 0014; Postgres via Testcontainers)', () => {
  let postgres: TestPostgres;
  let app: NestExpressApplication;
  let db: PrismaHandle;
  let ownerToken: string;

  beforeAll(async () => {
    postgres = await startPostgres();
    const template = await createCoreTemplate(postgres.getConnectionUri());
    const databaseUrl = await template.fresh();
    db = openPrisma(databaseUrl);
    await seedSystemRoles(db.prisma);
    await seedRolePermissions(db.prisma);
    app = await createTestApp(
      devEnv({
        ...dbEnvOf(databaseUrl),
        JWT_ACCESS_SECRET: TEST_SECRET_32_BYTES,
        JWT_ACCESS_KID: TEST_JWT_KID,
        OTP_PEPPER: TEST_SECRET_32_BYTES,
        ADMIN_ORIGIN: TEST_ADMIN_ORIGIN,
        WEB_ORIGIN: TEST_WEB_ORIGIN,
        TRUST_PROXY_HOPS: '1',
        REVIEWER_FEATURE_ENABLED: 'false',
      }),
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
      .post('/api/v1/auth/login')
      .send({ email: OWNER_EMAIL, password: PASSWORD });
    ownerToken = (login.body as { accessToken: string }).accessToken;
  });

  afterAll(async () => {
    await app?.close();
    await db?.close();
    await postgres?.stop();
  });

  const http = () => request(app.getHttpServer());
  const asOwner = () => ({ Authorization: `Bearer ${ownerToken}` });

  const FEATURE_OFF_ANSWER = { status: 404, errorCode: FEATURE_OFF_CODE };
  const answerOf = (res: request.Response) => ({
    status: res.status,
    errorCode: (res.body as { errorCode?: string }).errorCode,
  });

  it('answers the two public routes 404 REVIEWER_FEATURE_OFF', async () => {
    expect(answerOf(await http().get(`${REVIEWER}/status`))).toEqual(
      FEATURE_OFF_ANSWER,
    );
    expect(
      answerOf(await http().post(`${REVIEWER}/sessions`).send(SESSION_BODY)),
    ).toEqual(FEATURE_OFF_ANSWER);
  });

  it('keeps the owner routes behind authentication, then answers 404 REVIEWER_FEATURE_OFF', async () => {
    expect((await http().get(`${REVIEWER}/sessions`)).status).toBe(401);
    expect(
      (await http().put(`${REVIEWER}/settings`).send({ enabled: true })).status,
    ).toBe(401);

    expect(
      answerOf(await http().get(`${REVIEWER}/sessions`).set(asOwner())),
    ).toEqual(FEATURE_OFF_ANSWER);
    expect(
      answerOf(
        await http()
          .put(`${REVIEWER}/settings`)
          .set(asOwner())
          .send({ enabled: true }),
      ),
    ).toEqual(FEATURE_OFF_ANSWER);
  });

  it('writes no settings row and no reviewer session', async () => {
    expect(await db.prisma.reviewerSession.count()).toBe(0);
    expect(
      await db.prisma.appSetting.count({
        where: { key: { startsWith: 'reviewer' } },
      }),
    ).toBe(0);
  });
});
