import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import {
  REFRESH_TOKEN_BYTES,
  REFRESH_TOKEN_HASH_ALGORITHM,
  REFRESH_TOKEN_TTL_MS,
  USER_AGENT_MAX_LENGTH,
} from '../../common/constants/auth.constants';
import { type Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';

/** Where a refresh token was issued from (stored for session listings). */
export interface ClientMeta {
  readonly userAgent: string | undefined;
  readonly ip: string | undefined;
}

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
  | { readonly kind: 'invalid' }
  | {
      readonly kind: 'reuse';
      readonly accountId: number;
      readonly familyId: string;
    };

type Tx = Prisma.TransactionClient;

export function hashRefreshToken(rawToken: string): string {
  return createHash(REFRESH_TOKEN_HASH_ALGORITHM)
    .update(rawToken)
    .digest('hex');
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
  constructor(private readonly prisma: PrismaService) {}

  /** Starts a new family for a fresh login. Returns the raw token. */
  async issue(accountId: number, meta: ClientMeta): Promise<string> {
    const { token } = await this.create(
      this.prisma,
      accountId,
      randomUUID(),
      meta,
    );
    return token;
  }

  /**
   * Swaps `rawToken` for a new token in the same family, atomically. Two
   * concurrent refreshes with one token: the first wins, the second is reuse.
   */
  rotate(rawToken: string, meta: ClientMeta): Promise<RotationResult> {
    const tokenHash = hashRefreshToken(rawToken);
    return this.prisma.$transaction(async (tx): Promise<RotationResult> => {
      const current = await tx.refreshToken.findUnique({
        where: { tokenHash },
        include: {
          account: {
            select: {
              documentId: true,
              status: true,
              deletedAt: true,
              tokenVersion: true,
              role: { select: { policyVersion: true } },
            },
          },
        },
      });
      if (current === null) return { kind: 'invalid' };
      if (current.replacedById !== null) {
        return this.handleReuse(tx, current.accountId, current.familyId);
      }

      const now = new Date();
      const { account } = current;
      if (current.revokedAt !== null || current.expiresAt <= now) {
        return { kind: 'invalid' };
      }
      if (account.status !== 'active' || account.deletedAt !== null) {
        await this.revokeFamilyTx(tx, current.familyId, now);
        return { kind: 'invalid' };
      }

      const next = await this.create(
        tx,
        current.accountId,
        current.familyId,
        meta,
      );
      // Row lock: a concurrent rotation of the same token waits here, then
      // sees replaced_by_id set and claims nothing.
      const claimed = await tx.refreshToken.updateMany({
        where: { id: current.id, replacedById: null, revokedAt: null },
        data: { replacedById: next.id, revokedAt: now },
      });
      if (claimed.count === 0) {
        return this.handleReuse(tx, current.accountId, current.familyId);
      }

      return {
        kind: 'rotated',
        token: next.token,
        account: {
          documentId: account.documentId,
          tokenVersion: account.tokenVersion,
          policyVersion: account.role.policyVersion,
        },
      };
    });
  }

  /** Logout: revokes the family of `rawToken`, whatever its state. */
  async revokeFamilyOf(rawToken: string): Promise<void> {
    const current = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashRefreshToken(rawToken) },
      select: { familyId: true },
    });
    if (current === null) return;
    await this.revokeFamilyTx(this.prisma, current.familyId, new Date());
  }

  /** Password written (T12): every session of the account ends. */
  async revokeAllForAccount(tx: Tx, accountId: number): Promise<void> {
    await tx.refreshToken.updateMany({
      where: { accountId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async handleReuse(
    tx: Tx,
    accountId: number,
    familyId: string,
  ): Promise<RotationResult> {
    await this.revokeFamilyTx(tx, familyId, new Date());
    await tx.account.update({
      where: { id: accountId },
      data: { tokenVersion: { increment: 1 } },
    });
    return { kind: 'reuse', accountId, familyId };
  }

  private async revokeFamilyTx(
    tx: Tx,
    familyId: string,
    now: Date,
  ): Promise<void> {
    await tx.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  private async create(
    tx: Tx,
    accountId: number,
    familyId: string,
    meta: ClientMeta,
  ): Promise<{ id: number; token: string }> {
    const token = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
    const row = await tx.refreshToken.create({
      data: {
        accountId,
        familyId,
        tokenHash: hashRefreshToken(token),
        userAgent: meta.userAgent?.slice(0, USER_AGENT_MAX_LENGTH) ?? null,
        ip: meta.ip ?? null,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
      select: { id: true },
    });
    return { id: row.id, token };
  }
}
