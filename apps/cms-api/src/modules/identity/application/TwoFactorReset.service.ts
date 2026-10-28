import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';

import {
  CORE_TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../infrastructure/database/TransactionRunner.port';
import { AUDIT_ACTIONS } from '../../security-audit';
import {
  TWO_FACTOR_RESET_ERRORS,
  type TwoFaMethod,
} from '../domain/Identity.constants';
import {
  ACCOUNT_REPOSITORY,
  type AccountRepository,
  AUDIT_RECORDER,
  type AuditRecorder,
} from './Identity.port';
import { SessionRevocationService } from './SessionRevocation.service';

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
@Injectable()
export class TwoFactorResetService {
  constructor(
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
    @Inject(CORE_TRANSACTION_RUNNER) private readonly runner: TransactionRunner,
    private readonly sessions: SessionRevocationService,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async reset(rawEmail: string): Promise<TwoFactorResetResult> {
    const email = parseResetEmail(rawEmail);

    return this.runner.run(async (unit) => {
      const account = await this.accounts.findResettableAccount(unit, email);
      if (account === null) {
        throw new TwoFactorResetError(
          TWO_FACTOR_RESET_ERRORS.ACCOUNT_NOT_FOUND,
          'No account with this email.',
        );
      }

      // Conditional on 2FA still being on, so a concurrent disable is not
      // followed by a needless session wipe.
      if (!(await this.accounts.clearTwoFactor(unit, account.id))) {
        throw new TwoFactorResetError(
          TWO_FACTOR_RESET_ERRORS.NOT_ENABLED,
          'Two-factor authentication is not on for this account. Nothing changed.',
        );
      }
      await this.sessions.revokeAll(unit, account.id);
      // D15: an operator at the CLI, so actor_type system and no IP.
      await this.audit.record(unit, {
        actor: { type: 'system' },
        action: AUDIT_ACTIONS.TWO_FACTOR_RESET_BY_OPERATOR,
        subject: 'accounts',
        targetId: account.documentId,
        metadata: { previousMethod: account.twoFaMethod },
      });
      return { email: account.email, previousMethod: account.twoFaMethod };
    });
  }
}
