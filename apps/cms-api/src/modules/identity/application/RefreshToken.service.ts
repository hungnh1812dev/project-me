import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import type { ClientMeta } from '../../../common/types/ClientMeta.entity';
import { Clock } from '../../../common/time/Clock.service';
import {
  CORE_TRANSACTION_RUNNER,
  type TransactionRunner,
  type UnitOfWork,
} from '../../../infrastructure/database/TransactionRunner.port';
import { VersionCache } from '../../access';
import {
  AUDIT_ACTIONS,
  SecurityAuditService,
  selfActor,
} from '../../security-audit';
import { isRefreshInGrace } from '../domain/Authentication.rules';
import {
  REFRESH_TOKEN_BYTES,
  REFRESH_TOKEN_HASH_ALGORITHM,
  REFRESH_TOKEN_TTL_MS,
  USER_AGENT_MAX_LENGTH,
} from '../domain/Identity.constants';
import {
  REFRESH_TOKEN_REPOSITORY,
  type RefreshTokenAccountFacts,
  type RefreshTokenRepository,
} from './Identity.port';

/** Account fields needed to sign an access token after a rotation. */
export interface RotatedAccount {
  readonly documentId: string;
  readonly tokenVersion: number;
  readonly policyVersion: number;
}

export type RotationResult =
  | {
      readonly kind: 'rotated';
      readonly token: string;
      readonly account: RotatedAccount;
    }
  /**
   * A concurrent refresh with a token rotated moments ago. Access
   * token only; the refresh cookie already holds the successor.
   */
  | { readonly kind: 'grace'; readonly account: RotatedAccount }
  | { readonly kind: 'invalid' }
  | {
      readonly kind: 'reuse';
      readonly accountId: number;
      readonly familyId: string;
    };

export function hashRefreshToken(rawToken: string): string {
  return createHash(REFRESH_TOKEN_HASH_ALGORITHM)
    .update(rawToken)
    .digest('hex');
}

function rotatedAccountOf(account: RefreshTokenAccountFacts): RotatedAccount {
  return {
    documentId: account.documentId,
    tokenVersion: account.tokenVersion,
    policyVersion: account.policyVersion,
  };
}

/**
 * Opaque refresh tokens in `refresh_tokens` (D9). Only the SHA-256 of a
 * token is stored. Each login starts a family; every refresh replaces the
 * presented token with a new one in the same family. Presenting a token that
 * was already replaced is reuse: the whole family is revoked and the
 * account's `token_version` is bumped, so stolen tokens stop working.
 */
@Injectable()
export class RefreshTokenService {
  constructor(
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly tokens: RefreshTokenRepository,
    @Inject(CORE_TRANSACTION_RUNNER)
    private readonly runner: TransactionRunner,
    private readonly versions: VersionCache,
    private readonly audit: SecurityAuditService,
    private readonly clock: Clock,
  ) {}

  /**
   * Starts a new family for a fresh login. Returns the raw token. Pass `unit`
   * to issue it inside the caller's transaction (with its audit row).
   */
  async issue(
    accountId: number,
    meta: ClientMeta,
    unit?: UnitOfWork,
  ): Promise<string> {
    const { token } = await this.create(accountId, randomUUID(), meta, unit);
    return token;
  }

  /**
   * Swaps `rawToken` for a new token in the same family, atomically. Two
   * concurrent refreshes with one token: the first wins; the second gets
   * `grace` when it comes within REFRESH_TOKEN_REUSE_GRACE_MS and the
   * successor is still unused, else it is reuse.
   */
  rotate(rawToken: string, meta: ClientMeta): Promise<RotationResult> {
    const tokenHash = hashRefreshToken(rawToken);
    return this.runner.run(async (unit): Promise<RotationResult> => {
      const current = await this.tokens.findByHash(unit, tokenHash);
      if (current === null) return { kind: 'invalid' };
      const now = new Date(this.clock.now());
      const { account } = current;
      if (current.replacedById !== null) {
        return this.graceOrReuse(unit, current.id, now, meta);
      }

      if (current.revokedAt !== null || current.expiresAt <= now) {
        return { kind: 'invalid' };
      }
      if (account.status !== 'active' || account.deletedAt !== null) {
        await this.tokens.revokeFamily(unit, current.familyId, now);
        return { kind: 'invalid' };
      }

      const next = await this.create(
        current.accountId,
        current.familyId,
        meta,
        unit,
      );
      const claimed = await this.tokens.claimRotation(
        unit,
        current.id,
        next.id,
        now,
      );
      if (!claimed) {
        // A concurrent rotation won: drop the unused new token, then judge
        // this request like any late one.
        await this.tokens.deleteById(unit, next.id);
        return this.graceOrReuse(unit, current.id, now, meta);
      }

      return {
        kind: 'rotated',
        token: next.token,
        account: rotatedAccountOf(account),
      };
    });
  }

  /**
   * Logout: revokes the family of `rawToken`, whatever its state, and
   * audits it (D15 token revoke) in the same transaction.
   */
  async revokeFamilyOf(rawToken: string, meta: ClientMeta): Promise<void> {
    const owner = await this.tokens.findFamilyOwnerByHash(
      hashRefreshToken(rawToken),
    );
    if (owner === null) return;
    await this.runner.run(async (unit) => {
      await this.tokens.revokeFamily(
        unit,
        owner.familyId,
        new Date(this.clock.now()),
      );
      await this.audit.record(unit, {
        actor: selfActor(owner.accountId),
        action: AUDIT_ACTIONS.AUTH_LOGOUT,
        targetId: owner.accountDocumentId,
        ip: meta.ip,
      });
    });
  }

  /**
   * An already-rotated token came back. Grace when it was rotated
   * within the window, its successor is still live and unused and the
   * account is active; anything else is reuse, as before.
   */
  private async graceOrReuse(
    unit: UnitOfWork,
    tokenId: number,
    now: Date,
    meta: ClientMeta,
  ): Promise<RotationResult> {
    // Re-read: a rotation that won the row lock is committed by now.
    const token = await this.tokens.findRotated(unit, tokenId);
    if (!isRefreshInGrace(token, now)) {
      return this.handleReuse(
        unit,
        token.accountId,
        token.account,
        token.familyId,
        meta,
      );
    }
    return { kind: 'grace', account: rotatedAccountOf(token.account) };
  }

  private async handleReuse(
    unit: UnitOfWork,
    accountId: number,
    account: RefreshTokenAccountFacts,
    familyId: string,
    meta: ClientMeta,
  ): Promise<RotationResult> {
    await this.tokens.revokeFamilyAndBumpTokenVersion(
      unit,
      familyId,
      accountId,
      new Date(this.clock.now()),
    );
    await this.audit.record(unit, {
      actor: selfActor(accountId),
      action: AUDIT_ACTIONS.AUTH_REFRESH_REUSE_DETECTED,
      targetId: account.documentId,
      ip: meta.ip,
    });
    // Reuse bumped token_version: old access tokens die on the next request.
    unit.afterCommit(() => this.versions.invalidateAccount(accountId));
    return { kind: 'reuse', accountId, familyId };
  }

  private async create(
    accountId: number,
    familyId: string,
    meta: ClientMeta,
    unit?: UnitOfWork,
  ): Promise<{ id: number; token: string }> {
    const token = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
    const id = await this.tokens.insert(
      {
        accountId,
        familyId,
        tokenHash: hashRefreshToken(token),
        userAgent: meta.userAgent?.slice(0, USER_AGENT_MAX_LENGTH) ?? null,
        ip: meta.ip ?? null,
        expiresAt: new Date(this.clock.now() + REFRESH_TOKEN_TTL_MS),
      },
      unit,
    );
    return { id, token };
  }
}
