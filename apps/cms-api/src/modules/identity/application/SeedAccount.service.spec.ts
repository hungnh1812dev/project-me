import type {
  TransactionRunner,
  UnitOfWork,
} from '../../../infrastructure/database/TransactionRunner.port';
import { SEED_ACCOUNT_ERRORS } from '../domain/Identity.constants';
import type { AccountRepository } from './Identity.port';
import { SeedAccountService } from './SeedAccount.service';

jest.mock('./Password.service', () => ({
  hashPassword: jest.fn(() => Promise.resolve('hash')),
}));

const INPUT = {
  email: ' Reader@Example.com ',
  roleSlug: 'admin',
  isEmail2faEnabled: true,
  password: 'correct horse battery staple',
};

function build(state: { roleFound: boolean; emailTaken: boolean }) {
  const findRole = jest.fn(() =>
    Promise.resolve(state.roleFound ? { id: 3, isSystem: true } : null),
  );
  const createAccount = jest.fn(() =>
    Promise.resolve({ id: 8, documentId: 'doc-8', email: 'x' }),
  );
  const accounts = {
    findRole,
    isEmailTaken: jest.fn(() => Promise.resolve(state.emailTaken)),
    createAccount,
  } as unknown as AccountRepository;
  const unit = { afterCommit: jest.fn() } as UnitOfWork;
  const runner: TransactionRunner = { run: (work) => work(unit) };
  const record = jest.fn(() => Promise.resolve());
  return {
    service: new SeedAccountService(accounts, runner, { record }),
    findRole,
    createAccount,
    record,
    unit,
  };
}

describe('SeedAccountService.seed', () => {
  it('creates the account with the role id and the 2FA flag, and audits it in the same unit', async () => {
    const { service, createAccount, record, unit } = build({
      roleFound: true,
      emailTaken: false,
    });
    await expect(service.seed(INPUT, { NODE_ENV: 'test' })).resolves.toEqual({
      email: 'reader@example.com',
      roleSlug: 'admin',
    });
    expect(createAccount).toHaveBeenCalledWith(unit, {
      email: 'reader@example.com',
      displayName: 'reader',
      passwordHash: 'hash',
      roleId: 3,
      roleSlug: 'admin',
      isEmail2faEnabled: true,
    });
    expect(record).toHaveBeenCalledWith(
      unit,
      expect.objectContaining({
        actor: { type: 'system' },
        action: 'account.seeded',
        targetId: 'doc-8',
      }),
    );
  });

  it('refuses a missing role and a taken email, writing nothing', async () => {
    const missing = build({ roleFound: false, emailTaken: false });
    await expect(
      missing.service.seed(INPUT, { NODE_ENV: 'test' }),
    ).rejects.toMatchObject({ code: SEED_ACCOUNT_ERRORS.ROLE_REFUSED });
    const taken = build({ roleFound: true, emailTaken: true });
    await expect(
      taken.service.seed(INPUT, { NODE_ENV: 'test' }),
    ).rejects.toMatchObject({ code: SEED_ACCOUNT_ERRORS.EMAIL_TAKEN });
    expect(taken.createAccount).not.toHaveBeenCalled();
    expect(taken.record).not.toHaveBeenCalled();
  });

  it('refuses in production without the opt-in, before any database work', async () => {
    const { service, findRole } = build({
      roleFound: true,
      emailTaken: false,
    });
    await expect(
      service.seed(INPUT, { NODE_ENV: 'production' }),
    ).rejects.toMatchObject({ code: SEED_ACCOUNT_ERRORS.NOT_ALLOWED });
    expect(findRole).not.toHaveBeenCalled();
  });
});
