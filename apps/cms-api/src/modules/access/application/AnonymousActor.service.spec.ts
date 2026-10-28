import { DomainError } from '../../../common/errors/Domain.errors';

import type { RolePolicy } from '../domain/ActorContext.entity';
import type { RoleLookup } from './Access.port';
import { AnonymousActorService } from './AnonymousActor.service';
import type { VersionCache } from './VersionCache.service';

const PUBLIC_ROLE: RolePolicy = {
  id: 9,
  slug: 'public',
  rank: 0,
  isSystem: true,
  policyVersion: 1,
  permissions: [],
};

function setup(role: RolePolicy | null, roleId: number | null) {
  const findIdBySlug = jest.fn(() => Promise.resolve(roleId));
  const roles: RoleLookup = { findIdBySlug, findPolicy: jest.fn() };
  const getRolePolicy = jest.fn(() => Promise.resolve(role));
  const versions = { getRolePolicy } as unknown as VersionCache;
  return {
    service: new AnonymousActorService(roles, versions),
    findIdBySlug,
    getRolePolicy,
  };
}

describe('AnonymousActorService', () => {
  it('builds the anonymous actor from the public role', async () => {
    const t = setup(PUBLIC_ROLE, PUBLIC_ROLE.id);
    const actor = await t.service.actor();
    expect(actor.kind).toBe('anonymous');
    expect(actor.role).toBe(PUBLIC_ROLE);
  });

  it('remembers the role id but reads the rows on every call', async () => {
    const t = setup(PUBLIC_ROLE, PUBLIC_ROLE.id);
    await t.service.actor();
    await t.service.actor();
    expect(t.findIdBySlug).toHaveBeenCalledTimes(1);
    expect(t.getRolePolicy).toHaveBeenCalledTimes(2);
  });

  it('fails closed with 401 when the public role does not exist', async () => {
    const t = setup(null, null);
    await expect(t.service.actor()).rejects.toBeInstanceOf(DomainError);
    expect(t.getRolePolicy).not.toHaveBeenCalled();
  });

  it('fails closed and forgets the id when the role rows are gone', async () => {
    const t = setup(null, PUBLIC_ROLE.id);
    await expect(t.service.actor()).rejects.toBeInstanceOf(DomainError);
    await expect(t.service.actor()).rejects.toBeInstanceOf(DomainError);
    expect(t.findIdBySlug).toHaveBeenCalledTimes(2);
  });
});
