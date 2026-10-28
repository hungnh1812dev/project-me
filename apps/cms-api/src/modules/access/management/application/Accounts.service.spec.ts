import {
  accountRecord,
  actorWithRole,
  ACTOR_ID,
  fakeRunner,
} from '../../../../../test/fixtures/Management.fixture';
import type { SessionRevocationService } from '../../../identity';
import type { SecurityAuditService } from '../../../security-audit';
import type { VersionCache } from '../../application/VersionCache.service';
import { MANAGEMENT_ERROR_CODES } from '../domain/AccessManagement.constants';
import type {
  AccountAdminRepository,
  AccountChange,
} from './AccessManagement.port';
import { AccountsService } from './Accounts.service';

const META = { ip: '203.0.113.7', userAgent: 'jest' };
const TARGET = accountRecord();
const EDITOR_ROLE = {
  ...TARGET.role,
  id: 4,
  documentId: 'role-editor',
  slug: 'editor',
  rank: 30,
};

function build(
  overrides: {
    target?: ReturnType<typeof accountRecord> | null;
    role?: typeof EDITOR_ROLE | null;
    hasPassword?: boolean;
  } = {},
) {
  const { runner, unit, events } = fakeRunner();
  const target = overrides.target === undefined ? TARGET : overrides.target;
  const accounts = {
    listPage: jest.fn(() => Promise.resolve({ rows: [TARGET], total: 1 })),
    lockManageable: jest.fn(() => Promise.resolve(target)),
    lockRoleForAssignment: jest.fn(() =>
      Promise.resolve(
        overrides.role === undefined ? EDITOR_ROLE : overrides.role,
      ),
    ),
    update: jest.fn((_unit: unknown, _id: number, change: AccountChange) =>
      Promise.resolve({
        ...TARGET,
        ...(change.displayName === undefined
          ? {}
          : { displayName: change.displayName }),
        ...(change.role === undefined ? {} : { role: EDITOR_ROLE }),
      }),
    ),
    setStatus: jest.fn(() => Promise.resolve()),
    hasPassword: jest.fn(() => Promise.resolve(overrides.hasPassword ?? true)),
  };
  const versions = { invalidateAccount: jest.fn() };
  const audit = {
    record: jest.fn(() => {
      events.push('audit');
      return Promise.resolve();
    }),
  };
  const sessions = {
    revokeAll: jest.fn(() => {
      events.push('revoke');
      return Promise.resolve();
    }),
  };
  const service = new AccountsService(
    runner,
    accounts as unknown as AccountAdminRepository,
    versions as unknown as VersionCache,
    audit as unknown as SecurityAuditService,
    sessions as unknown as SessionRevocationService,
  );
  return { service, accounts, versions, audit, sessions, unit, events };
}

describe('AccountsService', () => {
  it('lists views, marking which accounts the actor may manage', async () => {
    const { service } = build();
    const page = await service.list(actorWithRole('admin'), {
      page: 1,
      pageSize: 20,
    });
    expect(page.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
    expect(page.data[0]).toMatchObject({
      id: TARGET.documentId,
      manageable: true,
    });
    expect(JSON.stringify(page)).not.toMatch(/password|tokenHash/i);
  });

  it('answers 404 when the lock finds no manageable account', async () => {
    const { service, accounts } = build({ target: null });
    await expect(
      service.disable(actorWithRole('admin'), TARGET.documentId, META),
    ).rejects.toMatchObject({
      kind: 'not_found',
      errorCode: MANAGEMENT_ERROR_CODES.ACCOUNT_NOT_FOUND,
    });
    expect(accounts.setStatus).not.toHaveBeenCalled();
  });

  it('answers 403 for the actor itself and writes nothing', async () => {
    const { service, accounts } = build({
      target: accountRecord({ id: ACTOR_ID }),
    });
    await expect(
      service.disable(actorWithRole('owner'), TARGET.documentId, META),
    ).rejects.toMatchObject({ kind: 'forbidden' });
    expect(accounts.setStatus).not.toHaveBeenCalled();
  });

  it('answers 403 for an account of equal or higher rank', async () => {
    const { service, accounts } = build({
      target: accountRecord({ role: { ...TARGET.role, rank: 40 } }),
    });
    await expect(
      service.update(
        actorWithRole('admin'),
        TARGET.documentId,
        { displayName: 'x' },
        META,
      ),
    ).rejects.toMatchObject({ kind: 'forbidden' });
    expect(accounts.update).not.toHaveBeenCalled();
  });

  describe('update', () => {
    it('audits a name change and a role change and drops the cache after the commit', async () => {
      const { service, audit, versions, events } = build();
      versions.invalidateAccount.mockImplementation(() => events.push('drop'));
      const view = await service.update(
        actorWithRole('admin'),
        TARGET.documentId,
        { displayName: 'New name', roleId: EDITOR_ROLE.documentId },
        META,
      );
      expect(view).toMatchObject({
        displayName: 'New name',
        role: { slug: 'editor' },
      });
      expect(audit.record).toHaveBeenCalledTimes(2);
      expect(audit.record).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'account.updated',
          metadata: { fields: ['displayName'] },
          ip: META.ip,
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'account.role_changed',
          metadata: { fromRole: 'guest', toRole: 'editor' },
        }),
      );
      expect(events).toEqual(['audit', 'audit', 'committed', 'drop']);
    });

    it('does not audit an unchanged name', async () => {
      const { service, audit } = build();
      await service.update(
        actorWithRole('admin'),
        TARGET.documentId,
        { displayName: TARGET.displayName },
        META,
      );
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('refuses a role the actor does not outrank and drops nothing', async () => {
      const { service, versions } = build({
        role: { ...EDITOR_ROLE, rank: 40, slug: 'admin' },
      });
      await expect(
        service.update(
          actorWithRole('admin'),
          TARGET.documentId,
          { roleId: EDITOR_ROLE.documentId },
          META,
        ),
      ).rejects.toMatchObject({ kind: 'forbidden' });
      expect(versions.invalidateAccount).not.toHaveBeenCalled();
    });

    it('refuses a role accounts never hold with 400', async () => {
      const { service } = build({
        role: { ...EDITOR_ROLE, slug: 'reviewer', rank: 20 },
      });
      await expect(
        service.update(
          actorWithRole('admin'),
          TARGET.documentId,
          { roleId: EDITOR_ROLE.documentId },
          META,
        ),
      ).rejects.toMatchObject({
        kind: 'invalid_input',
        errorCode: MANAGEMENT_ERROR_CODES.ROLE_NOT_ASSIGNABLE,
      });
    });

    it('answers 404 for an unknown role', async () => {
      const { service } = build({ role: null });
      await expect(
        service.update(
          actorWithRole('admin'),
          TARGET.documentId,
          { roleId: EDITOR_ROLE.documentId },
          META,
        ),
      ).rejects.toMatchObject({
        errorCode: MANAGEMENT_ERROR_CODES.ROLE_NOT_FOUND,
      });
    });
  });

  describe('disable', () => {
    it('sets the status, ends the sessions and audits in one unit, then drops the cache', async () => {
      const { service, accounts, sessions, audit, versions, unit, events } =
        build();
      versions.invalidateAccount.mockImplementation(() => events.push('drop'));
      await service.disable(actorWithRole('admin'), TARGET.documentId, META);
      expect(accounts.setStatus).toHaveBeenCalledWith(
        unit,
        TARGET.id,
        'disabled',
        ACTOR_ID,
      );
      expect(sessions.revokeAll).toHaveBeenCalledWith(unit, TARGET.id);
      expect(audit.record).toHaveBeenCalledWith(
        unit,
        expect.objectContaining({
          action: 'account.disabled',
          subject: 'accounts',
        }),
      );
      expect(events).toEqual(['revoke', 'audit', 'committed', 'drop']);
    });

    it('answers 409 for an account that is already disabled', async () => {
      const { service, sessions, versions } = build({
        target: accountRecord({ status: 'disabled' }),
      });
      await expect(
        service.disable(actorWithRole('admin'), TARGET.documentId, META),
      ).rejects.toMatchObject({
        kind: 'conflict',
        errorCode: MANAGEMENT_ERROR_CODES.ACCOUNT_ALREADY_DISABLED,
      });
      expect(sessions.revokeAll).not.toHaveBeenCalled();
      expect(versions.invalidateAccount).not.toHaveBeenCalled();
    });
  });

  describe('enable', () => {
    it.each([
      [true, 'active'],
      [false, 'invited'],
    ])(
      'with a password %s the account returns to %s',
      async (hasPassword, status) => {
        const { service, accounts, audit, unit } = build({
          target: accountRecord({ status: 'disabled' }),
          hasPassword,
        });
        await service.enable(actorWithRole('admin'), TARGET.documentId, META);
        expect(accounts.setStatus).toHaveBeenCalledWith(
          unit,
          TARGET.id,
          status,
          ACTOR_ID,
        );
        expect(audit.record).toHaveBeenCalledWith(
          unit,
          expect.objectContaining({
            action: 'account.enabled',
            metadata: { status },
          }),
        );
      },
    );

    it('answers 409 for an account that is not disabled', async () => {
      const { service } = build();
      await expect(
        service.enable(actorWithRole('admin'), TARGET.documentId, META),
      ).rejects.toMatchObject({
        errorCode: MANAGEMENT_ERROR_CODES.ACCOUNT_NOT_DISABLED,
      });
    });
  });

  it('revokeSessions ends the sessions, audits and drops the cache after the commit', async () => {
    const { service, sessions, audit, versions, unit, events } = build();
    versions.invalidateAccount.mockImplementation(() => events.push('drop'));
    await service.revokeSessions(
      actorWithRole('admin'),
      TARGET.documentId,
      META,
    );
    expect(sessions.revokeAll).toHaveBeenCalledWith(unit, TARGET.id);
    expect(audit.record).toHaveBeenCalledWith(
      unit,
      expect.objectContaining({ action: 'account.sessions_revoked' }),
    );
    expect(events).toEqual(['revoke', 'audit', 'committed', 'drop']);
  });
});
