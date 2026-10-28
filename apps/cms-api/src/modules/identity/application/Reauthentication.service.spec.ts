import { DomainError } from '../../../common/errors/Domain.errors';
import type {
  TransactionRunner,
  UnitOfWork,
} from '../../../infrastructure/database/TransactionRunner.port';
import { AccountStatus } from '../../access';
import {
  AUDIT_ACTIONS,
  REAUTH_FAILURE_REASONS,
  REAUTH_PURPOSES,
  type SecurityAuditService,
  selfActor,
} from '../../security-audit';
import { AUTH_ERROR_CODES } from '../domain/Identity.constants';
import type {
  AccountRepository,
  TwoFactorAccountRecord,
} from './Identity.port';
import type { OtpService } from './Otp.service';
import { ReauthenticationService } from './Reauthentication.service';
import type { TotpService } from './Totp.service';

const PASSWORD = 'correct horse battery';
const HASH = `hash-of:${PASSWORD}`;
const CODE = '123456';
const META = { userAgent: undefined, ip: '203.0.113.9' };
const PURPOSE = REAUTH_PURPOSES.BACKUP_DOWNLOAD;

jest.mock('./Password.service', () => ({
  verifyPassword: jest.fn((hash: string, password: string) =>
    Promise.resolve(hash === `hash-of:${password}`),
  ),
}));

function accountRecord(
  overrides: Partial<TwoFactorAccountRecord> = {},
): TwoFactorAccountRecord {
  return {
    id: 4,
    documentId: 'doc-4',
    email: 'owner@example.test',
    passwordHash: HASH,
    status: AccountStatus.active,
    deletedAt: null,
    tokenVersion: 0,
    is2faEnabled: true,
    twoFaMethod: 'totp',
    policyVersion: 1,
    totpSecretEnc: 'sealed',
    totpSecretKid: 'k1',
    totpLastStep: null,
    ...overrides,
  };
}

function build(
  account: TwoFactorAccountRecord | null,
  options: {
    totpAccepts?: boolean;
    liveOtpId?: number;
    consumes?: boolean;
  } = {},
) {
  const accounts = {
    findTwoFactorAccount: jest.fn(() => Promise.resolve(account)),
  } as unknown as AccountRepository;
  const unit = { afterCommit: jest.fn() } as UnitOfWork;
  const runner: TransactionRunner = { run: (work) => work(unit) };
  const verifyAccountCode = jest.fn(() =>
    Promise.resolve(options.totpAccepts ?? true),
  );
  const totp = { verifyAccountCode } as unknown as TotpService;
  const verify = jest.fn(() => Promise.resolve(options.liveOtpId));
  const tryConsume = jest.fn(() => Promise.resolve(options.consumes ?? true));
  const otp = { verify, tryConsume } as unknown as OtpService;
  const recordStandalone = jest.fn(() => Promise.resolve());
  const audit = { recordStandalone } as unknown as SecurityAuditService;
  return {
    service: new ReauthenticationService(accounts, runner, totp, otp, audit),
    verifyAccountCode,
    verify,
    tryConsume,
    recordStandalone,
    unit,
  };
}

async function refusalOf(promise: Promise<unknown>): Promise<DomainError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof DomainError) return error;
    throw error;
  }
  throw new Error('expected a DomainError');
}

describe('ReauthenticationService.confirm', () => {
  const input = { password: PASSWORD, code: CODE };

  it('accepts the password and a TOTP code, and writes no audit row', async () => {
    const { service, verifyAccountCode, recordStandalone } =
      build(accountRecord());
    await expect(
      service.confirm('doc-4', input, PURPOSE, META),
    ).resolves.toBeUndefined();
    expect(verifyAccountCode).toHaveBeenCalledWith(expect.anything(), CODE);
    expect(recordStandalone).not.toHaveBeenCalled();
  });

  it('accepts an emailed code and consumes it in its own transaction', async () => {
    const { service, verify, tryConsume, unit, recordStandalone } = build(
      accountRecord({ twoFaMethod: 'email' }),
      { liveOtpId: 77 },
    );
    await service.confirm('doc-4', input, PURPOSE, META);
    expect(verify).toHaveBeenCalledWith(4, 'LOGIN_2FA_EMAIL', CODE);
    expect(tryConsume).toHaveBeenCalledWith(unit, 77);
    expect(recordStandalone).not.toHaveBeenCalled();
  });

  it('rejects an emailed code that was already used', async () => {
    const { service, recordStandalone } = build(
      accountRecord({ twoFaMethod: 'email' }),
      { liveOtpId: 77, consumes: false },
    );
    const refusal = await refusalOf(
      service.confirm('doc-4', input, PURPOSE, META),
    );
    expect(refusal.kind).toBe('forbidden');
    expect(recordStandalone).toHaveBeenCalledTimes(1);
  });

  it('rejects an emailed code that is unknown or malformed', async () => {
    const unknown = build(accountRecord({ twoFaMethod: 'email' }), {});
    await refusalOf(unknown.service.confirm('doc-4', input, PURPOSE, META));
    expect(unknown.tryConsume).not.toHaveBeenCalled();

    const malformed = build(accountRecord({ twoFaMethod: 'email' }), {
      liveOtpId: 1,
    });
    await refusalOf(
      malformed.service.confirm(
        'doc-4',
        { password: PASSWORD, code: 'abc' },
        PURPOSE,
        META,
      ),
    );
    expect(malformed.verify).not.toHaveBeenCalled();
  });

  it('refuses a wrong password with 403 and one bad_password row', async () => {
    const { service, verifyAccountCode, recordStandalone } =
      build(accountRecord());
    const refusal = await refusalOf(
      service.confirm('doc-4', { password: 'nope', code: CODE }, PURPOSE, META),
    );
    expect(refusal.kind).toBe('forbidden');
    expect(refusal.errorCode).toBe(AUTH_ERROR_CODES.INVALID_CREDENTIALS);
    expect(verifyAccountCode).not.toHaveBeenCalled();
    expect(recordStandalone).toHaveBeenCalledTimes(1);
    expect(recordStandalone).toHaveBeenCalledWith({
      actor: selfActor(4),
      action: AUDIT_ACTIONS.AUTH_REAUTH_FAILED,
      targetId: 'doc-4',
      metadata: {
        purpose: PURPOSE,
        reason: REAUTH_FAILURE_REASONS.BAD_PASSWORD,
      },
      ip: META.ip,
    });
  });

  it('treats an account without a password as a wrong password', async () => {
    const { service, recordStandalone } = build(
      accountRecord({ passwordHash: null }),
    );
    const refusal = await refusalOf(
      service.confirm('doc-4', input, PURPOSE, META),
    );
    expect(refusal.errorCode).toBe(AUTH_ERROR_CODES.INVALID_CREDENTIALS);
    expect(recordStandalone).toHaveBeenCalledTimes(1);
  });

  it('refuses a wrong or replayed TOTP code with one bad_code row', async () => {
    const { service, recordStandalone } = build(accountRecord(), {
      totpAccepts: false,
    });
    const refusal = await refusalOf(
      service.confirm('doc-4', input, PURPOSE, META),
    );
    expect(refusal.kind).toBe('forbidden');
    expect(refusal.errorCode).toBe(AUTH_ERROR_CODES.INVALID_2FA_CODE);
    expect(recordStandalone).toHaveBeenCalledTimes(1);
    expect(recordStandalone).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { purpose: PURPOSE, reason: REAUTH_FAILURE_REASONS.BAD_CODE },
      }),
    );
  });

  it('refuses with 403 AUTH_2FA_NOT_ENABLED and no audit row when 2FA is off', async () => {
    const { service, recordStandalone } = build(
      accountRecord({ is2faEnabled: false, twoFaMethod: null }),
    );
    const refusal = await refusalOf(
      service.confirm('doc-4', input, PURPOSE, META),
    );
    expect(refusal.kind).toBe('forbidden');
    expect(refusal.errorCode).toBe(AUTH_ERROR_CODES.TWO_FACTOR_NOT_ENABLED);
    expect(recordStandalone).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', null],
    ['invited', accountRecord({ status: AccountStatus.invited })],
    ['disabled', accountRecord({ status: AccountStatus.disabled })],
    ['deleted', accountRecord({ deletedAt: new Date() })],
  ])('refuses as not signed in for a %s account', async (_name, account) => {
    const { service, recordStandalone } = build(account);
    const refusal = await refusalOf(
      service.confirm('doc-4', input, PURPOSE, META),
    );
    expect(refusal.kind).toBe('unauthenticated');
    expect(recordStandalone).not.toHaveBeenCalled();
  });
});
