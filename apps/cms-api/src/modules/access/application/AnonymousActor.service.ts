import { Inject, Injectable } from '@nestjs/common';

import {
  type ActorContext,
  anonymousActor,
  unauthenticated,
} from '../domain/ActorContext.entity';
import { PUBLIC_ROLE_SLUG } from '../domain/SystemRoles.entity';
import { ROLE_LOOKUP, type RoleLookup } from './Access.port';
import { VersionCache } from './VersionCache.service';

/**
 * The actor of a request without credentials (SPEC §1): the `public` system
 * role with its current permission rows, read through `VersionCache` like
 * any role, so an Owner's edit applies on the next request. The role's id is
 * remembered (system role slugs never change, D6); its rows never are.
 *
 * Fails closed: when the `public` role is missing (seed not run) the request
 * is 401, not an actor without rows.
 */
@Injectable()
export class AnonymousActorService {
  private publicRoleId: number | undefined;

  constructor(
    @Inject(ROLE_LOOKUP) private readonly roles: RoleLookup,
    private readonly versions: VersionCache,
  ) {}

  /** @throws DomainError (unauthenticated) when the `public` role does not exist. */
  async actor(): Promise<ActorContext> {
    const roleId = await this.roleId();
    const role = await this.versions.getRolePolicy(roleId);
    if (role === null) {
      this.publicRoleId = undefined;
      throw unauthenticated();
    }
    return anonymousActor(role);
  }

  private async roleId(): Promise<number> {
    if (this.publicRoleId !== undefined) return this.publicRoleId;
    const id = await this.roles.findIdBySlug(PUBLIC_ROLE_SLUG);
    if (id === null) throw unauthenticated();
    this.publicRoleId = id;
    return id;
  }
}
