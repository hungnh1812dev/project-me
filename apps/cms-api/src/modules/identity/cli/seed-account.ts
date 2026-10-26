import { parseArgs } from 'node:util';

import { loadAppConfig } from '../../../config/app-config';
import { openPrisma } from '../../../infrastructure/database/prisma-client';
import type { PrismaClient } from '../../../generated/prisma/client';
import {
  ACCOUNT_SEEDED_CHANNEL,
  AUDIT_ACTIONS,
  writeAuditLog,
} from '../../security-audit';
import {
  SEED_ACCOUNT_ERRORS,
  SEED_ACCOUNT_OPTIONS,
  SEED_ACCOUNT_OPT_IN,
  SEED_ACCOUNT_ROLES,
} from '../domain/Identity.constants';
import { ownerInputSchema } from '../owner-bootstrap';
import { hashPassword } from '../application/Password.service';
import { CliInputError, readPasswordFromStream } from './password-input';

/**
 * `seed:account` (SPEC D1, smoke stacks only): creates one active test
 * account. Never reachable over HTTP: no Nest module imports this file.
 * The password comes from stdin only and is never printed.
 */
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

function assertRoleAllowed(roleSlug: string): void {
  if (SEED_ACCOUNT_ROLES.includes(roleSlug)) return;
  throw new SeedAccountError(
    SEED_ACCOUNT_ERRORS.ROLE_REFUSED,
    `Role not allowed. Allowed: ${SEED_ACCOUNT_ROLES.join(', ')}.`,
  );
}

/** The password flag is required: stdin is the only password source. */
export function parseSeedArgs(argv: readonly string[]): SeedAccountArgs {
  const O = SEED_ACCOUNT_OPTIONS;
  let values;
  try {
    ({ values } = parseArgs({
      args: [...argv],
      allowPositionals: false,
      strict: true,
      options: {
        [O.EMAIL]: { type: 'string' },
        [O.ROLE]: { type: 'string' },
        [O.EMAIL_2FA]: { type: 'boolean' },
        [O.PASSWORD_STDIN]: { type: 'boolean' },
      },
    }));
  } catch (error) {
    throw new CliInputError(
      error instanceof Error ? error.message : 'Invalid arguments.',
    );
  }
  const email = values[O.EMAIL];
  const roleSlug = values[O.ROLE];
  if (email === undefined || email.trim() === '') {
    throw new CliInputError(`--${O.EMAIL} is required.`);
  }
  if (roleSlug === undefined) {
    throw new CliInputError(`--${O.ROLE} is required.`);
  }
  if (values[O.PASSWORD_STDIN] !== true) {
    throw new CliInputError(`--${O.PASSWORD_STDIN} is required.`);
  }
  assertRoleAllowed(roleSlug);
  return {
    email,
    roleSlug,
    isEmail2faEnabled: values[O.EMAIL_2FA] === true,
  };
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
 * Creates one active account with an allowlisted role and writes the
 * `account.seeded` audit row in the same transaction (D15). A taken email is
 * refused: nothing is updated, promoted or replaced.
 */
export async function seedAccount(
  prisma: PrismaClient,
  input: SeedAccountInput,
  env: NodeJS.ProcessEnv = process.env,
): Promise<SeededAccount> {
  assertSeedAllowed(env);
  assertRoleAllowed(input.roleSlug);
  const { email, password } = parseSeedFields(input);
  const passwordHash = await hashPassword(password);
  const [displayName = email] = email.split('@');

  return prisma.$transaction(async (tx) => {
    const role = await tx.role.findUnique({
      where: { slug: input.roleSlug },
      select: { id: true },
    });
    if (role === null) {
      throw new SeedAccountError(
        SEED_ACCOUNT_ERRORS.ROLE_REFUSED,
        'The role does not exist. Run db:migrate (it seeds the roles) first.',
      );
    }
    const taken = await tx.account.findUnique({
      where: { email },
      select: { id: true },
    });
    if (taken !== null) {
      throw new SeedAccountError(
        SEED_ACCOUNT_ERRORS.EMAIL_TAKEN,
        'An account with this email already exists; it is left unchanged.',
      );
    }
    const created = await tx.account.create({
      data: {
        email,
        displayName,
        passwordHash,
        status: 'active',
        role: { connect: { id_slug: { id: role.id, slug: input.roleSlug } } },
        ...(input.isEmail2faEnabled
          ? { is2faEnabled: true, twoFaMethod: 'email' as const }
          : {}),
      },
      select: { documentId: true },
    });
    await writeAuditLog(tx, {
      actor: { type: 'system' },
      action: AUDIT_ACTIONS.ACCOUNT_SEEDED,
      subject: 'accounts',
      targetId: created.documentId,
      metadata: { channel: ACCOUNT_SEEDED_CHANNEL, role: input.roleSlug },
    });
    return { email, roleSlug: input.roleSlug };
  });
}

function messageOf(error: unknown): string {
  // Other errors (Prisma's) can quote the query, which holds the hash.
  return error instanceof SeedAccountError || error instanceof CliInputError
    ? error.message
    : 'Seeding failed.';
}

async function main(): Promise<void> {
  assertSeedAllowed(process.env);
  const args = parseSeedArgs(process.argv.slice(2));
  const password = await readPasswordFromStream(process.stdin);

  const config = loadAppConfig(process.env);
  const { prisma, close } = openPrisma(config.database);
  try {
    const seeded = await seedAccount(prisma, { ...args, password });
    process.stdout.write(
      `Seeded account: ${seeded.email} (${seeded.roleSlug})\n`,
    );
  } finally {
    await close();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    process.stderr.write(`${messageOf(error)}\n`);
    process.exitCode = 1;
  });
}
