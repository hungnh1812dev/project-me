import { Injectable } from '@nestjs/common';

import { Clock } from '../../common/time/clock';
import type { AccountStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import {
  VERSION_CACHE_MAX_ENTRIES,
  VERSION_CACHE_TTL_MS,
} from './access.constants';
import { type RolePolicy, rolePolicyFromRows } from './actor-context';

/** What the guard needs to know about an account on every request. */
export interface AccountVersions {
  id: number;
  documentId: string;
  tokenVersion: number;
  status: AccountStatus;
  deleted: boolean;
  roleId: number;
  /** The reviewer session of an ephemeral reviewer account (D2); null otherwise. */
  reviewerSessionId: number | null;
}

interface Entry<T> {
  value: T;
  expiresAt: number;
}

/** Insertion-ordered map with a TTL and a size cap (oldest out first). */
class TtlMap<K, V> {
  private readonly entries = new Map<K, Entry<V>>();
  /**
   * Bumped by every delete. A read that started before a delete must not
   * cache what it read (it may predate the write), see `setIfUnchanged`.
   */
  private generation = 0;

  constructor(private readonly clock: Clock) {}

  get(key: K): V | undefined {
    const entry = this.entries.get(key);
    if (entry === undefined) return undefined;
    if (entry.expiresAt <= this.clock.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  currentGeneration(): number {
    return this.generation;
  }

  /** Caches `value` unless something was invalidated since `generation`. */
  setIfUnchanged(key: K, value: V, generation: number): void {
    if (generation !== this.generation) return;
    this.entries.delete(key);
    if (this.entries.size >= VERSION_CACHE_MAX_ENTRIES) {
      const oldest = this.entries.keys().next();
      if (oldest.done !== true) this.entries.delete(oldest.value);
    }
    this.entries.set(key, {
      value,
      expiresAt: this.clock.now() + VERSION_CACHE_TTL_MS,
    });
  }

  delete(key: K): void {
    this.generation += 1;
    this.entries.delete(key);
  }

  deleteWhere(match: (value: V) => boolean): void {
    this.generation += 1;
    for (const [key, entry] of this.entries) {
      if (match(entry.value)) this.entries.delete(key);
    }
  }

  clear(): void {
    this.generation += 1;
    this.entries.clear();
  }
}

/**
 * D9 revocation versions: `accounts.token_version` (+ status, role) and each
 * role's `policy_version` with its permission rows, cached in process.
 *
 * - Every write in this process calls `invalidate*()` after its commit, so
 *   with one replica a change applies on the very next request.
 * - Entries expire after VERSION_CACHE_TTL_MS, which bounds staleness for
 *   writes made elsewhere (another replica, the `owner:reset-2fa` CLI).
 * - A token newer than the cache (`tv`/`pv` claim above the cached value)
 *   forces a re-read, so it never waits for the TTL.
 *
 * In memory: one API replica only. Before scaling out, swap it for a shared
 * store or a pub/sub invalidation (same note as the rate-limit store).
 */
@Injectable()
export class VersionCache {
  private readonly accounts: TtlMap<string, AccountVersions | null>;
  private readonly roles: TtlMap<number, RolePolicy | null>;

  constructor(
    private readonly prisma: PrismaService,
    clock: Clock,
  ) {
    this.accounts = new TtlMap(clock);
    this.roles = new TtlMap(clock);
  }

  /**
   * Account by `document_id` (the JWT `sub`); null if it does not exist.
   * `minTokenVersion`: re-read when the cache holds an older version.
   */
  async account(
    documentId: string,
    minTokenVersion?: number,
  ): Promise<AccountVersions | null> {
    const cached = this.accounts.get(documentId);
    if (
      cached !== undefined &&
      (cached === null ||
        minTokenVersion === undefined ||
        cached.tokenVersion >= minTokenVersion)
    ) {
      return cached;
    }
    const generation = this.accounts.currentGeneration();
    const row = await this.prisma.account.findUnique({
      where: { documentId },
      select: {
        id: true,
        documentId: true,
        tokenVersion: true,
        status: true,
        deletedAt: true,
        roleId: true,
        reviewerSessions: { select: { id: true }, take: 1 },
      },
    });
    const value =
      row === null
        ? null
        : {
            id: row.id,
            documentId: row.documentId,
            tokenVersion: row.tokenVersion,
            status: row.status,
            deleted: row.deletedAt !== null,
            roleId: row.roleId,
            reviewerSessionId: row.reviewerSessions[0]?.id ?? null,
          };
    this.accounts.setIfUnchanged(documentId, value, generation);
    return value;
  }

  /**
   * A role with its permission rows; null if it does not exist.
   * `minPolicyVersion`: re-read when the cache holds an older version.
   */
  async rolePolicy(
    roleId: number,
    minPolicyVersion?: number,
  ): Promise<RolePolicy | null> {
    const cached = this.roles.get(roleId);
    if (
      cached !== undefined &&
      (cached === null ||
        minPolicyVersion === undefined ||
        cached.policyVersion >= minPolicyVersion)
    ) {
      return cached;
    }
    const generation = this.roles.currentGeneration();
    const row = await this.prisma.role.findUnique({
      where: { id: roleId },
      select: {
        id: true,
        slug: true,
        rank: true,
        isSystem: true,
        policyVersion: true,
        permissions: {
          select: {
            subject: true,
            action: true,
            readableFields: true,
            writableFields: true,
            conditions: true,
          },
          orderBy: { id: 'asc' },
        },
      },
    });
    const value =
      row === null
        ? null
        : rolePolicyFromRows(
            {
              id: row.id,
              slug: row.slug,
              rank: row.rank,
              isSystem: row.isSystem,
              policyVersion: row.policyVersion,
            },
            row.permissions,
          );
    this.roles.setIfUnchanged(roleId, value, generation);
    return value;
  }

  /** Call after committing a write to an account (tv, status, role, delete). */
  invalidateAccount(accountId: number): void {
    this.accounts.deleteWhere((value) => value?.id === accountId);
  }

  /** Call after committing a write to a role or its permissions. */
  invalidateRole(roleId: number): void {
    this.roles.delete(roleId);
  }

  clear(): void {
    this.accounts.clear();
    this.roles.clear();
  }
}
