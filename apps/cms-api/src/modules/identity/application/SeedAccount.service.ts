import { Inject, Injectable } from '@nestjs/common';

import {
  CORE_TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../infrastructure/database/TransactionRunner.port';
import { ACCOUNT_SEEDED_CHANNEL, AUDIT_ACTIONS } from '../../security-audit';
import {
  SEED_ACCOUNT_ERRORS,
  SEED_ACCOUNT_OPT_IN,
  SEED_ACCOUNT_ROLES,
} from '../domain/Identity.constants';
import {
  ACCOUNT_REPOSITORY,
  type AccountRepository,
  AUDIT_RECORDER,
  type AuditRecorder,
} from './Identity.port';
import { ownerInputSchema } from './OwnerBootstrap.service';
import { hashPassword } from './Password.service';

type SeedAccountErrorCode =
  (typeof SEED_ACCOUNT_ERRORS)[keyof typeof SEED_ACCOUNT_ERRORS];

/** Messages never contain the password or a submitted value. */
export class SeedAccountError extends Error {
  constructor(
    readonly code: SeedAccountErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SeedAccountError';
  }
}

export interface SeedAccountArgs {
  readonly email: string;
  readonly roleSlug: string;
  readonly isEmail2faEnabled: boolean;
}

export interface SeedAccountInput extends SeedAccountArgs {
  readonly password: string;
}

export interface SeededAccount {
  readonly email: string;
  readonly roleSlug: string;
}

/** Exact value check, not truthiness: `ALLOW_ACCOUNT_SEED=1` fails (S1). */
export function assertSeedAllowed(env: NodeJS.ProcessEnv): void {
  if (env.NODE_ENV !== 'production') return;
  if (env[SEED_ACCOUNT_OPT_IN.ENV_KEY] === SEED_ACCOUNT_OPT_IN.VALUE) return;
  throw new SeedAccountError(
    SEED_ACCOUNT_ERRORS.NOT_ALLOWED,
    `seed:account is for smoke stacks only. In production it needs ${SEED_ACCOUNT_OPT_IN.ENV_KEY}=${SEED_ACCOUNT_OPT_IN.VALUE} on that one command.`,
  );
}

export function assertRoleAllowed(roleSlug: string): void {
  if (SEED_ACCOUNT_ROLES.includes(roleSlug)) return;
  throw new SeedAccountError(
    SEED_ACCOUNT_ERRORS.ROLE_REFUSED,
    `Role not allowed. Allowed: ${SEED_ACCOUNT_ROLES.join(', ')}.`,
  );
}

function parseSeedFields(input: SeedAccountInput) {
  const parsed = ownerInputSchema.safeParse({
    email: input.email,
    password: input.password,
  });
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new SeedAccountError(
      SEED_ACCOUNT_ERRORS.INVALID_INPUT,
      `Invalid input (${problems}).`,
    );
  }
  return parsed.data;
}

/**
 * `seed:account` (SPEC D1, smoke stacks only): creates one active test
 * account. Never reachable over HTTP: no Nest module provides this class,
 * and only `cli/` files reach this file. The password comes from stdin only
 * and is never printed.
 * Creates one active account with an allowlisted role and writes the
 * `account.seeded` audit row in the same transaction (D15). A taken email is
 * refused: nothing is updated, promoted or replaced.
 */
@Injectable()
export class SeedAccountService {
  constructor(
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
    @Inject(CORE_TRANSACTION_RUNNER) private readonly runner: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async seed(
    input: SeedAccountInput,
    env: NodeJS.ProcessEnv,
  ): Promise<SeededAccount> {
    assertSeedAllowed(env);
    assertRoleAllowed(input.roleSlug);
    const { email, password } = parseSeedFields(input);
    const passwordHash = await hashPassword(password);
    const [displayName = email] = email.split('@');

    return this.runner.run(async (unit) => {
      const role = await this.accounts.findRole(unit, input.roleSlug);
      if (role === null) {
        throw new SeedAccountError(
          SEED_ACCOUNT_ERRORS.ROLE_REFUSED,
          'The role does not exist. Run db:migrate (it seeds the roles) first.',
        );
      }
      if (await this.accounts.isEmailTaken(unit, email)) {
        throw new SeedAccountError(
          SEED_ACCOUNT_ERRORS.EMAIL_TAKEN,
          'An account with this email already exists; it is left unchanged.',
        );
      }
      const created = await this.accounts.createAccount(unit, {
        email,
        displayName,
        passwordHash,
        roleId: role.id,
        roleSlug: input.roleSlug,
        isEmail2faEnabled: input.isEmail2faEnabled,
      });
      await this.audit.record(unit, {
        actor: { type: 'system' },
        action: AUDIT_ACTIONS.ACCOUNT_SEEDED,
        subject: 'accounts',
        targetId: created.documentId,
        metadata: { channel: ACCOUNT_SEEDED_CHANNEL, role: input.roleSlug },
      });
      return { email, roleSlug: input.roleSlug };
    });
  }
}
