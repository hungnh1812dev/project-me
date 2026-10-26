import {
  systemRole,
  testCatalog,
} from '../../../../../test/fixtures/access.fixture';
import {
  actorWithRole,
  fakeRunner,
} from '../../../../../test/fixtures/management.fixture';
import type { SecurityAuditService } from '../../../security-audit';
import type { AccessPolicyService } from '../../application/AccessPolicy.service';
import type {
  PermissionWriteOptions,
  RolePermissionsService,
} from '../../application/RolePermissions.service';
import type { VersionCache } from '../../application/VersionCache.service';
import { PolicyEvaluator } from '../../domain/PolicyEvaluator';
import {
  MANAGEMENT_ERROR_CODES,
  MANAGEMENT_LIMITS,
} from '../domain/AccessManagement.constants';
import type { RoleRecord } from './AccessManagement.port';
import { RolesService } from './Roles.service';

const META = { ip: '203.0.113.7', userAgent: 'jest' };
const CUSTOM: RoleRecord = {
  id: 50,
  documentId: 'role-custom',
  slug: 'moderator',
  name: 'Moderator',
  rank: 25,
  isSystem: false,
  policyVersion: 1,
  permissions: [],
};

function build(
  overrides: {
    locked?: RoleRecord | null;
    customRoleCount?: number;
    accountCount?: number;
  } = {},
) {
  const { runner, unit, events } = fakeRunner();
  const locked = overrides.locked === undefined ? CUSTOM : overrides.locked;
  const roles = {
    listWithAccountCounts: jest.fn(() =>
      Promise.resolve({
        roles: [CUSTOM],
        accountCounts: new Map([[CUSTOM.id, 2]]),
      }),
    ),
    findByDocumentId: jest.fn(() => Promise.resolve(locked)),
    lockByDocumentId: jest.fn(() => Promise.resolve(locked)),
    countAccounts: jest.fn(() => Promise.resolve(overrides.accountCount ?? 0)),
    lockAndCountCustomRoles: jest.fn(() =>
      Promise.resolve(overrides.customRoleCount ?? 0),
    ),
    create: jest.fn(() => Promise.resolve(CUSTOM)),
    update: jest.fn((_unit: unknown, _id: number, change: { name?: string }) =>
      Promise.resolve({ ...CUSTOM, ...change }),
    ),
    remove: jest.fn(() => Promise.resolve()),
  };
  const catalog = testCatalog();
  const access = {
    policy: () =>
      Promise.resolve({ catalog, evaluator: new PolicyEvaluator(catalog) }),
  };
  const rolePermissions = {
    replacePermissions: jest.fn(
      (
        _roleId: number,
        _grants: unknown,
        _options?: PermissionWriteOptions,
      ): Promise<number> => Promise.resolve(2),
    ),
  };
  const versions = { invalidateRole: jest.fn(() => events.push('drop')) };
  const audit = {
    record: jest.fn(() => {
      events.push('audit');
      return Promise.resolve();
    }),
  };
  const service = new RolesService(
    runner,
    roles,
    access as unknown as AccessPolicyService,
    rolePermissions as unknown as RolePermissionsService,
    versions as unknown as VersionCache,
    audit as unknown as SecurityAuditService,
  );
  return { service, roles, rolePermissions, versions, audit, unit, events };
}

describe('RolesService', () => {
  it('lists roles with their account counts and manageable flag', async () => {
    const { service } = build();
    const [view] = await service.list(actorWithRole('admin'));
    expect(view).toMatchObject({
      id: CUSTOM.documentId,
      accountCount: 2,
      manageable: true,
    });
  });

  describe('create', () => {
    it('writes the role and its audit row in one unit', async () => {
      const { service, roles, audit, unit } = build();
      await service.create(
        actorWithRole('admin'),
        { slug: 'moderator', name: 'Moderator', rank: 25 },
        META,
      );
      expect(roles.create).toHaveBeenCalledWith(
        unit,
        expect.objectContaining({ rank: 25 }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        unit,
        expect.objectContaining({
          action: 'role.created',
          subject: 'roles',
          metadata: { slug: 'moderator', rank: 25 },
        }),
      );
    });

    it('answers 409 at the custom role cap and creates nothing', async () => {
      const { service, roles } = build({
        customRoleCount: MANAGEMENT_LIMITS.MAX_CUSTOM_ROLES,
      });
      await expect(
        service.create(
          actorWithRole('admin'),
          { slug: 'x', name: 'X', rank: 25 },
          META,
        ),
      ).rejects.toMatchObject({
        errorCode: MANAGEMENT_ERROR_CODES.ROLE_LIMIT_REACHED,
      });
      expect(roles.create).not.toHaveBeenCalled();
    });

    it('refuses a rank the actor does not outrank before opening a unit', async () => {
      const { service, roles } = build();
      await expect(
        service.create(
          actorWithRole('admin'),
          { slug: 'x', name: 'X', rank: 40 },
          META,
        ),
      ).rejects.toMatchObject({ kind: 'forbidden' });
      expect(roles.lockAndCountCustomRoles).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('audits the changed fields and drops the role after the commit', async () => {
      const { service, audit, events } = build();
      await service.update(
        actorWithRole('admin'),
        CUSTOM.documentId,
        { name: 'Mods' },
        META,
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'role.updated',
          metadata: { fields: ['name'] },
        }),
      );
      expect(events).toEqual(['audit', 'committed', 'drop']);
    });

    it('writes nothing for an unchanged role', async () => {
      const { service, roles, audit } = build();
      await service.update(
        actorWithRole('admin'),
        CUSTOM.documentId,
        { name: CUSTOM.name },
        META,
      );
      expect(roles.update).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('answers 409 for a rank change on a system role', async () => {
      const { service } = build({
        locked: { ...CUSTOM, isSystem: true, rank: 30 },
      });
      await expect(
        service.update(
          actorWithRole('admin'),
          CUSTOM.documentId,
          { rank: 25 },
          META,
        ),
      ).rejects.toMatchObject({
        errorCode: MANAGEMENT_ERROR_CODES.ROLE_SYSTEM_IMMUTABLE,
      });
    });

    it('refuses a role the actor does not outrank', async () => {
      const { service, roles } = build({ locked: { ...CUSTOM, rank: 40 } });
      await expect(
        service.update(
          actorWithRole('admin'),
          CUSTOM.documentId,
          { name: 'x' },
          META,
        ),
      ).rejects.toMatchObject({ kind: 'forbidden' });
      expect(roles.update).not.toHaveBeenCalled();
    });

    it('answers 404 for an unknown role', async () => {
      const { service } = build({ locked: null });
      await expect(
        service.update(
          actorWithRole('admin'),
          CUSTOM.documentId,
          { name: 'x' },
          META,
        ),
      ).rejects.toMatchObject({
        errorCode: MANAGEMENT_ERROR_CODES.ROLE_NOT_FOUND,
      });
    });
  });

  describe('remove', () => {
    it('deletes an unused custom role, audits it and drops the cache after the commit', async () => {
      const { service, roles, events } = build();
      await service.remove(actorWithRole('admin'), CUSTOM.documentId, META);
      expect(roles.remove).toHaveBeenCalled();
      expect(events).toEqual(['audit', 'committed', 'drop']);
    });

    it('answers 409 with the count while accounts hold the role', async () => {
      const { service, roles, versions } = build({ accountCount: 3 });
      await expect(
        service.remove(actorWithRole('admin'), CUSTOM.documentId, META),
      ).rejects.toMatchObject({
        errorCode: MANAGEMENT_ERROR_CODES.ROLE_IN_USE,
        details: { accountCount: 3 },
      });
      expect(roles.remove).not.toHaveBeenCalled();
      expect(versions.invalidateRole).not.toHaveBeenCalled();
    });

    it('answers 409 for a system role', async () => {
      const { service } = build({ locked: { ...CUSTOM, isSystem: true } });
      await expect(
        service.remove(actorWithRole('admin'), CUSTOM.documentId, META),
      ).rejects.toMatchObject({
        errorCode: MANAGEMENT_ERROR_CODES.ROLE_SYSTEM_IMMUTABLE,
      });
    });
  });

  describe('replacePermissions', () => {
    it('refuses a system subject action the actor lacks, with the row indexes', async () => {
      const { service, rolePermissions } = build();
      const rows = [
        { subject: 'article', action: 'read' },
        { subject: 'audit_logs', action: 'read' },
      ];
      await expect(
        service.replacePermissions(
          actorWithRole('admin'),
          CUSTOM.documentId,
          rows,
          META,
        ),
      ).rejects.toMatchObject({
        kind: 'forbidden',
        errorCode: MANAGEMENT_ERROR_CODES.PERMISSION_NOT_HELD,
        details: { indexes: [1] },
      });
      expect(rolePermissions.replacePermissions).not.toHaveBeenCalled();
    });

    it('answers 400 with every issue for an invalid set', async () => {
      const { service } = build();
      await expect(
        service.replacePermissions(
          actorWithRole('admin'),
          CUSTOM.documentId,
          [{ subject: 'nope' }],
          META,
        ),
      ).rejects.toMatchObject({
        kind: 'invalid_input',
        details: {
          issues: expect.arrayContaining([expect.anything()]) as unknown,
        },
      });
    });

    it('writes through RolePermissionsService and audits in its unit', async () => {
      const { service, rolePermissions, audit } = build();
      rolePermissions.replacePermissions.mockImplementation(
        async (_roleId, _grants, options) => {
          await options?.alsoInTransaction?.({ afterCommit: jest.fn() }, 2);
          return 2;
        },
      );
      await service.replacePermissions(
        actorWithRole('owner'),
        CUSTOM.documentId,
        [{ subject: 'article', action: 'read' }],
        META,
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'role.permissions_replaced',
          metadata: {
            subjects: ['article'],
            permissionCount: 1,
            policyVersion: 2,
          },
        }),
      );
    });

    it('refuses a role the actor does not outrank before validating', async () => {
      const { service, rolePermissions } = build({
        locked: { ...CUSTOM, rank: systemRole('admin').rank },
      });
      await expect(
        service.replacePermissions(
          actorWithRole('admin'),
          CUSTOM.documentId,
          [],
          META,
        ),
      ).rejects.toMatchObject({ kind: 'forbidden' });
      expect(rolePermissions.replacePermissions).not.toHaveBeenCalled();
    });
  });
});
