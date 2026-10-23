import { TEST_SECRET_32_BYTES } from '../../../test/fixtures/env.fixture';
import { systemRole } from '../../../test/fixtures/access.fixture';
import { type IAppConfig } from '../../config/app-config';
import type { PrismaService } from '../../infrastructure/database/prisma.service';
import { accountActor, anonymousActor, apiTokenActor } from '../access';
import { AUDIT_ACTIONS } from './security-audit.constants';
import {
  auditActorOf,
  type AuditWriter,
  SecurityAuditService,
  writeAuditLog,
} from './security-audit.service';

function capturingWriter() {
  const rows: unknown[] = [];
  const writer = {
    auditLog: {
      create: (args: { data: unknown }) => {
        rows.push(args.data);
        return Promise.resolve(args.data);
      },
    },
  } as unknown as AuditWriter;
  return { rows, writer };
}

function serviceWith(otpPepper: string | undefined): SecurityAuditService {
  const config = { secrets: { otpPepper } } as unknown as IAppConfig;
  return new SecurityAuditService({} as PrismaService, config);
}

describe('writeAuditLog (D15)', () => {
  it('maps the actor and defaults optional columns to null', async () => {
    const { rows, writer } = capturingWriter();
    await writeAuditLog(writer, {
      actor: { type: 'account', accountId: 7 },
      action: AUDIT_ACTIONS.ACCOUNT_DISABLED,
      subject: 'accounts',
      targetId: 'doc-1',
    });
    await writeAuditLog(writer, {
      actor: { type: 'system' },
      action: AUDIT_ACTIONS.TWO_FACTOR_RESET_BY_OPERATOR,
    });
    expect(rows).toEqual([
      {
        actorId: 7,
        actorType: 'account',
        action: 'account.disabled',
        subject: 'accounts',
        targetId: 'doc-1',
        metadata: {},
        ip: null,
      },
      {
        actorId: null,
        actorType: 'system',
        action: 'two_factor.reset_by_operator',
        subject: null,
        targetId: null,
        metadata: {},
        ip: null,
      },
    ]);
  });

  it('records the token id of an API token actor in metadata', async () => {
    const { rows, writer } = capturingWriter();
    await writeAuditLog(writer, {
      actor: { type: 'api_token', accountId: 3, tokenId: 11 },
      action: AUDIT_ACTIONS.ROLE_UPDATED,
      metadata: { fields: ['name'] },
    });
    expect(rows[0]).toMatchObject({
      actorId: 3,
      actorType: 'api_token',
      metadata: { fields: ['name'], tokenId: 11 },
    });
  });
});

describe('auditActorOf', () => {
  it('maps every actor kind', () => {
    const role = systemRole('admin');
    expect(auditActorOf(accountActor(5, role))).toEqual({
      type: 'account',
      accountId: 5,
    });
    expect(
      auditActorOf(apiTokenActor(9, 5, role, { permissions: [] })),
    ).toEqual({ type: 'api_token', accountId: 5, tokenId: 9 });
    expect(auditActorOf(anonymousActor(systemRole('public')))).toEqual({
      type: 'account',
      accountId: null,
    });
  });
});

describe('SecurityAuditService.emailHmac (T17 Q4)', () => {
  const service = serviceWith(TEST_SECRET_32_BYTES);

  it('is a keyed hex digest of the normalized email, never the email', () => {
    const digest = service.emailHmac(' Someone@Example.test ');
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).toBe(service.emailHmac('someone@example.test'));
    expect(digest).not.toBe(service.emailHmac('other@example.test'));
    expect(digest).not.toBe(
      serviceWith(`${TEST_SECRET_32_BYTES}x`).emailHmac('someone@example.test'),
    );
  });

  it('is null without OTP_PEPPER (development only)', () => {
    expect(serviceWith(undefined).emailHmac('someone@example.test')).toBeNull();
  });
});
