import { Injectable, UnauthorizedException } from '@nestjs/common';

import { PrismaService } from '../../infrastructure/database/prisma.service';
import { PUBLIC_ROLE_SLUG } from './roles/system-roles';
import {
  type ActorContext,
  anonymousActor,
} from './domain/ActorContext.entity';
import { VersionCache } from './version-cache';

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
    private readonly prisma: PrismaService,
    private readonly versions: VersionCache,
  ) {}

  /** @throws UnauthorizedException when the `public` role does not exist. */
  async actor(): Promise<ActorContext> {
    const roleId = await this.roleId();
    const role = await this.versions.getRolePolicy(roleId);
    if (role === null) {
      this.publicRoleId = undefined;
      throw new UnauthorizedException();
    }
    return anonymousActor(role);
  }

  private async roleId(): Promise<number> {
    if (this.publicRoleId !== undefined) return this.publicRoleId;
    const row = await this.prisma.role.findUnique({
      where: { slug: PUBLIC_ROLE_SLUG },
      select: { id: true },
    });
    if (row === null) throw new UnauthorizedException();
    this.publicRoleId = row.id;
    return row.id;
  }
}
