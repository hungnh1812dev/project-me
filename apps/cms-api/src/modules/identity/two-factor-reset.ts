import { z } from 'zod';

import type { PrismaClient, TwoFaMethod } from '../../generated/prisma/client';
import { AUDIT_ACTIONS } from '../security-audit';
import { writeAuditLog } from '../security-audit';
import { TWO_FACTOR_RESET_ERRORS } from './domain/Identity.constants';
import { unitOfWorkFromPrismaTx } from '../../infrastructure/database/PrismaTransactionRunner.adapter';
import { revokeAllSessions } from './adapters/PrismaSessionRevocation.repository';

type TwoFactorResetErrorCode =
  (typeof TWO_FACTOR_RESET_ERRORS)[keyof typeof TWO_FACTOR_RESET_ERRORS];

/** Messages never contain secrets (no TOTP secret, no token). */
export class TwoFactorResetError extends Error {
  constructor(
    readonly code: TwoFactorResetErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'TwoFactorResetError';
  }
}

export interface TwoFactorResetResult {
  readonly email: string;
  /** The method that was on before the reset. */
  readonly previousMethod: TwoFaMethod | null;
}

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: 'must be a valid email address' }));

/** Trims and lower-cases the email; the issue message never echoes the value. */
export function parseResetEmail(email: string): string {
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) {
    throw new TwoFactorResetError(
      TWO_FACTOR_RESET_ERRORS.INVALID_INPUT,
      'Invalid email (must be a valid email address).',
    );
  }
  return parsed.data;
}

/**
 * Break-glass 2FA recovery (`owner:reset-2fa`): turns 2FA off for one
 * account (any role, the owner included) and ends all its sessions. One
 * transaction clears the method and the sealed TOTP secret, kid and last
 * step, bumps token_version (access tokens and 2FA temp tokens die on their
 * next check), revokes every refresh token and writes the audit row. A deleted account counts as
 * unknown; an account with 2FA off is refused and left untouched.
 */
export async function resetTwoFactor(
  prisma: PrismaClient,
  rawEmail: string,
): Promise<TwoFactorResetResult> {
  const email = parseResetEmail(rawEmail);

  return prisma.$transaction(async (tx) => {
    const account = await tx.account.findFirst({
      where: { email, deletedAt: null },
      select: { id: true, documentId: true, email: true, twoFaMethod: true },
    });
    if (account === null) {
      throw new TwoFactorResetError(
        TWO_FACTOR_RESET_ERRORS.ACCOUNT_NOT_FOUND,
        'No account with this email.',
      );
    }

    // Conditional on 2FA still being on, so a concurrent disable is not
    // followed by a needless session wipe.
    const reset = await tx.account.updateMany({
      where: { id: account.id, is2faEnabled: true },
      data: {
        is2faEnabled: false,
        twoFaMethod: null,
        totpSecretEnc: null,
        totpSecretKid: null,
        totpLastStep: null,
      },
    });
    if (reset.count === 0) {
      throw new TwoFactorResetError(
        TWO_FACTOR_RESET_ERRORS.NOT_ENABLED,
        'Two-factor authentication is not on for this account. Nothing changed.',
      );
    }
    await revokeAllSessions(unitOfWorkFromPrismaTx(tx), account.id);
    // D15: an operator at the CLI, so actor_type system and no IP.
    await writeAuditLog(tx, {
      actor: { type: 'system' },
      action: AUDIT_ACTIONS.TWO_FACTOR_RESET_BY_OPERATOR,
      subject: 'accounts',
      targetId: account.documentId,
      metadata: { previousMethod: account.twoFaMethod },
    });
    return { email: account.email, previousMethod: account.twoFaMethod };
  });
}
