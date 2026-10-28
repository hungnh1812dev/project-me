import type {
  TransactionRunner,
  UnitOfWork,
} from '../../../infrastructure/database/TransactionRunner.port';
import { TWO_FACTOR_RESET_ERRORS } from '../domain/Identity.constants';
import type { AccountRepository } from './Identity.port';
import type { SessionRevocationService } from './SessionRevocation.service';
import {
  parseResetEmail,
  TwoFactorResetError,
  TwoFactorResetService,
} from './TwoFactorReset.service';

function errorOf(email: string): TwoFactorResetError {
  try {
    parseResetEmail(email);
  } catch (error) {
    if (error instanceof TwoFactorResetError) return error;
    throw error;
  }
  throw new Error('expected parseResetEmail to throw');
}

describe('parseResetEmail', () => {
  it('trims and lower-cases the email', () => {
    expect(parseResetEmail('  Owner@Example.COM ')).toBe('owner@example.com');
  });

  it.each(['', '   ', 'not-an-email'])('rejects %j', (email) => {
    expect(errorOf(email).code).toBe(TWO_FACTOR_RESET_ERRORS.INVALID_INPUT);
  });

  it('does not echo the rejected value', () => {
    expect(errorOf('secret-looking-input').message).not.toContain(
      'secret-looking-input',
    );
  });
});

describe('TwoFactorResetService.reset', () => {
  const ACCOUNT = {
    id: 4,
    documentId: 'doc-4',
    email: 'a@example.test',
    twoFaMethod: 'totp' as const,
  };

  function build(state: { account: typeof ACCOUNT | null; cleared: boolean }) {
    const findResettableAccount = jest.fn(() => Promise.resolve(state.account));
    const accounts = {
      findResettableAccount,
      clearTwoFactor: jest.fn(() => Promise.resolve(state.cleared)),
    } as unknown as AccountRepository;
    const unit = { afterCommit: jest.fn() } as UnitOfWork;
    const runner: TransactionRunner = { run: (work) => work(unit) };
    const revokeAll = jest.fn(() => Promise.resolve());
    const sessions = { revokeAll } as unknown as SessionRevocationService;
    const record = jest.fn(() => Promise.resolve());
    return {
      service: new TwoFactorResetService(accounts, runner, sessions, {
        record,
      }),
      findResettableAccount,
      revokeAll,
      record,
      unit,
    };
  }

  it('turns 2FA off, ends the sessions and audits a system row in the same unit', async () => {
    const { service, findResettableAccount, revokeAll, record, unit } = build({
      account: ACCOUNT,
      cleared: true,
    });
    await expect(service.reset(' A@Example.test ')).resolves.toEqual({
      email: 'a@example.test',
      previousMethod: 'totp',
    });
    expect(findResettableAccount).toHaveBeenCalledWith(unit, 'a@example.test');
    expect(revokeAll).toHaveBeenCalledWith(unit, 4);
    expect(record).toHaveBeenCalledWith(
      unit,
      expect.objectContaining({
        actor: { type: 'system' },
        action: 'two_factor.reset_by_operator',
        targetId: 'doc-4',
        metadata: { previousMethod: 'totp' },
      }),
    );
  });

  it('refuses an unknown account', async () => {
    const { service } = build({ account: null, cleared: false });
    await expect(service.reset('a@example.test')).rejects.toMatchObject({
      code: TWO_FACTOR_RESET_ERRORS.ACCOUNT_NOT_FOUND,
    });
  });

  it('refuses an account whose 2FA is already off and ends no session', async () => {
    const { service, revokeAll, record } = build({
      account: ACCOUNT,
      cleared: false,
    });
    await expect(service.reset('a@example.test')).rejects.toMatchObject({
      code: TWO_FACTOR_RESET_ERRORS.NOT_ENABLED,
    });
    expect(revokeAll).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });
});
