import { Inject, Injectable } from '@nestjs/common';

import {
  DEFAULT_ROLE_PERMISSIONS,
  SYSTEM_ROLES,
} from '../domain/SystemRoles.entity';
import { ROLE_SEED_STORE, type RoleSeedStore } from './Access.port';

export class SystemRoleSeedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SystemRoleSeedError';
  }
}

/** Seeds the system roles and their default permissions. Both are idempotent. */
@Injectable()
export class RoleSeedService {
  constructor(@Inject(ROLE_SEED_STORE) private readonly store: RoleSeedStore) {}

  /**
   * Inserts the missing system roles and never updates existing ones, so names
   * edited by the Owner survive. Fails if a role with a system slug exists but
   * is not that system role (e.g. a custom role took the slug). Returns the
   * slugs it inserted.
   */
  async seedSystemRoles(): Promise<string[]> {
    const slugs = SYSTEM_ROLES.map((role) => role.slug);
    const before = new Set(
      (await this.store.findRolesBySlugs(slugs)).map((role) => role.slug),
    );
    await this.store.insertMissingSystemRoles(
      SYSTEM_ROLES.map(({ slug, name, rank }) => ({ slug, name, rank })),
    );

    const bySlug = new Map(
      (await this.store.findRolesBySlugs(slugs)).map((row) => [row.slug, row]),
    );
    for (const expected of SYSTEM_ROLES) {
      const row = bySlug.get(expected.slug);
      if (row?.isSystem !== true || row.rank !== expected.rank) {
        throw new SystemRoleSeedError(
          `Role "${expected.slug}" exists but is not the system role (rank ${expected.rank}).`,
        );
      }
    }
    return slugs.filter((slug) => !before.has(slug));
  }

  /**
   * Seeds the default permission rows into each system role that has none
   * yet, so the Owner's later edits are never overwritten. Run after
   * `seedSystemRoles`. Returns the slugs it seeded.
   */
  seedRolePermissions(): Promise<string[]> {
    return this.store.seedPermissionsWhereMissing(DEFAULT_ROLE_PERMISSIONS);
  }
}
