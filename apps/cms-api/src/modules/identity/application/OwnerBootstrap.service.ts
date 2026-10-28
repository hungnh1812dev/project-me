import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';

import {
  CORE_TRANSACTION_RUNNER,
  type TransactionRunner,
  type UnitOfWork,
} from '../../../infrastructure/database/TransactionRunner.port';
import { OWNER_ROLE_SLUG } from '../../access';
import {
  AUDIT_ACTIONS,
  OWNER_CREATED_CHANNELS,
  type OwnerCreatedChannel,
  selfActor,
} from '../../security-audit';
import {
  OWNER_BOOTSTRAP_ERRORS,
  OWNER_DISPLAY_NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../domain/Identity.constants';
import {
  ACCOUNT_REPOSITORY,
  type AccountRepository,
  AUDIT_RECORDER,
  type AuditRecorder,
  type CreatedAccount,
} from './Identity.port';
import { hashPassword } from './Password.service';

type OwnerBootstrapErrorCode =
  (typeof OWNER_BOOTSTRAP_ERRORS)[keyof typeof OWNER_BOOTSTRAP_ERRORS];

/** Messages never contain the password. */
export class OwnerBootstrapError extends Error {
  constructor(
    readonly code: OwnerBootstrapErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'OwnerBootstrapError';
  }
}

export interface OwnerBootstrapInput {
  email: string;
  /** Defaults to the local part of the email. */
  displayName?: string | undefined;
  password: string;
}

/** Who creates the owner; decides the `owner.created` audit row (ADR 0005). */
export interface OwnerBootstrapOptions {
  readonly channel: OwnerCreatedChannel;
  /** Client IP of the setup request; the CLI has none. */
  readonly ip?: string | undefined;
}

/** Shared by the CLI and the setup route, so both enforce the same rules. */
export const ownerInputSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ message: 'must be a valid email address' })),
  displayName: z
    .string()
    .trim()
    .min(1)
    .max(OWNER_DISPLAY_NAME_MAX_LENGTH)
    .optional(),
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, {
      message: `must be at least ${PASSWORD_MIN_LENGTH} characters`,
    })
    .max(PASSWORD_MAX_LENGTH, {
      message: `must be at most ${PASSWORD_MAX_LENGTH} characters`,
    }),
});

/** Validates and normalises the input. Issue messages name fields, never values. */
export function parseOwnerInput(input: OwnerBootstrapInput): {
  email: string;
  displayName: string;
  password: string;
} {
  const parsed = ownerInputSchema.safeParse(input);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new OwnerBootstrapError(
      OWNER_BOOTSTRAP_ERRORS.INVALID_INPUT,
      `Invalid owner input (${problems}).`,
    );
  }
  const { email, displayName, password } = parsed.data;
  const [localPart = email] = email.split('@');
  return { email, displayName: displayName ?? localPart, password };
}

/**
 * Creates the single owner account (D1). The password is hashed first
 * (Argon2id, outside the lock), then one transaction takes the advisory
 * lock, refuses if a live owner exists or the email is taken, and inserts
 * an active account with the system `owner` role. Concurrent runs queue on
 * the lock; the partial unique index `accounts_single_owner_uq` is the last
 * line of defence. With `options`, the `owner.created` audit row is written
 * in the same transaction (D15): the setup page's row names the new owner as
 * actor, the CLI's is a system row.
 */
@Injectable()
export class OwnerBootstrapService {
  constructor(
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
    @Inject(CORE_TRANSACTION_RUNNER) private readonly runner: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async bootstrap(
    input: OwnerBootstrapInput,
    options?: OwnerBootstrapOptions,
  ): Promise<CreatedAccount> {
    const { email, displayName, password } = parseOwnerInput(input);
    const passwordHash = await hashPassword(password);

    return this.runner.run(async (unit) => {
      await this.accounts.lockOwnerCreation(unit);
      await this.assertNoLiveOwner(unit);
      const roleId = await this.findSystemOwnerRoleId(unit);
      await this.assertEmailFree(unit, email);

      const created = await this.accounts.createAccount(unit, {
        email,
        displayName,
        passwordHash,
        roleId,
        roleSlug: OWNER_ROLE_SLUG,
      });
      if (options !== undefined) {
        await this.recordOwnerCreated(unit, created, options);
      }
      return created;
    });
  }

  private async assertNoLiveOwner(unit: UnitOfWork): Promise<void> {
    if (await this.accounts.hasLiveOwner(unit)) {
      throw new OwnerBootstrapError(
        OWNER_BOOTSTRAP_ERRORS.OWNER_EXISTS,
        'An owner account already exists. owner:bootstrap runs only once.',
      );
    }
  }

  private async findSystemOwnerRoleId(unit: UnitOfWork): Promise<number> {
    const role = await this.accounts.findRole(unit, OWNER_ROLE_SLUG);
    if (role === null || !role.isSystem) {
      throw new OwnerBootstrapError(
        OWNER_BOOTSTRAP_ERRORS.ROLE_MISSING,
        'The system owner role is missing. Run db:migrate (it seeds the roles) first.',
      );
    }
    return role.id;
  }

  private async assertEmailFree(
    unit: UnitOfWork,
    email: string,
  ): Promise<void> {
    if (await this.accounts.isEmailTaken(unit, email)) {
      throw new OwnerBootstrapError(
        OWNER_BOOTSTRAP_ERRORS.EMAIL_TAKEN,
        'An account with this email already exists; existing accounts are never promoted to owner.',
      );
    }
  }

  private recordOwnerCreated(
    unit: UnitOfWork,
    created: CreatedAccount,
    options: OwnerBootstrapOptions,
  ): Promise<void> {
    return this.audit.record(unit, {
      actor:
        options.channel === OWNER_CREATED_CHANNELS.CLI
          ? { type: 'system' }
          : selfActor(created.id),
      action: AUDIT_ACTIONS.OWNER_CREATED,
      subject: 'accounts',
      targetId: created.documentId,
      metadata: { channel: options.channel },
      ip: options.ip,
    });
  }
}
