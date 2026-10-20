import { z } from 'zod';

import type { PrismaClient } from '../../generated/prisma/client';
import {
  OWNER_BOOTSTRAP_ERRORS,
  OWNER_BOOTSTRAP_LOCK_KEY,
  OWNER_ROLE_SLUG,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from './identity.constants';
import { hashPassword } from './password-hasher';

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

export interface OwnerAccount {
  id: number;
  documentId: string;
  email: string;
}

const ownerInputSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ message: 'must be a valid email address' })),
  displayName: z.string().trim().min(1).optional(),
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
 * (Argon2id, outside the lock), then one transaction takes
 * `pg_advisory_xact_lock`, refuses if a live owner exists or the email is
 * taken, and inserts an active account with the system `owner` role.
 * Concurrent runs queue on the lock; the partial unique index
 * `accounts_single_owner_uq` is the last line of defence.
 */
export async function bootstrapOwner(
  prisma: PrismaClient,
  input: OwnerBootstrapInput,
): Promise<OwnerAccount> {
  const { email, displayName, password } = parseOwnerInput(input);
  const passwordHash = await hashPassword(password);

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${OWNER_BOOTSTRAP_LOCK_KEY})`;

    const owner = await tx.account.findFirst({
      where: { roleSlug: OWNER_ROLE_SLUG, deletedAt: null },
      select: { id: true },
    });
    if (owner !== null) {
      throw new OwnerBootstrapError(
        OWNER_BOOTSTRAP_ERRORS.OWNER_EXISTS,
        'An owner account already exists. owner:bootstrap runs only once.',
      );
    }

    const role = await tx.role.findUnique({
      where: { slug: OWNER_ROLE_SLUG },
      select: { id: true, isSystem: true },
    });
    if (role === null || !role.isSystem) {
      throw new OwnerBootstrapError(
        OWNER_BOOTSTRAP_ERRORS.ROLE_MISSING,
        'The system owner role is missing. Run db:migrate (it seeds the roles) first.',
      );
    }

    const taken = await tx.account.findUnique({
      where: { email },
      select: { id: true },
    });
    if (taken !== null) {
      throw new OwnerBootstrapError(
        OWNER_BOOTSTRAP_ERRORS.EMAIL_TAKEN,
        'An account with this email already exists; existing accounts are never promoted to owner.',
      );
    }

    return tx.account.create({
      data: {
        email,
        displayName,
        passwordHash,
        status: 'active',
        role: { connect: { id_slug: { id: role.id, slug: OWNER_ROLE_SLUG } } },
      },
      select: { id: true, documentId: true, email: true },
    });
  });
}
