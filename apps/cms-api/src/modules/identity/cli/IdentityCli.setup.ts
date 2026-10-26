import { z } from 'zod';

import { type IAppConfig } from '../../../config/app-config';
import { Clock } from '../../../common/time/clock';
import type { PrismaClient } from '../../../generated/prisma/client';
import {
  prismaTxOf,
  PrismaTransactionRunner,
} from '../../../infrastructure/database/PrismaTransactionRunner.adapter';
import { openPrisma } from '../../../infrastructure/database/prisma-client';
import { NestAppLogger } from '../../../infrastructure/logging/NestAppLogger.adapter';
import { writeAuditLog } from '../../security-audit';
import { PrismaAccountRepository } from '../adapters/PrismaAccount.repository';
import { PrismaSessionRevocationRepository } from '../adapters/PrismaSessionRevocation.repository';
import type { AuditRecorder } from '../application/Identity.port';
import { OwnerBootstrapService } from '../application/OwnerBootstrap.service';
import { SeedAccountService } from '../application/SeedAccount.service';
import { SessionRevocationService } from '../application/SessionRevocation.service';
import { TwoFactorResetService } from '../application/TwoFactorReset.service';
import { OWNER_ENV_KEYS } from '../domain/Identity.constants';
import { CliInputError } from './PasswordInput.client';

/** A blank value counts as not set. */
const optionalText = z
  .string()
  .optional()
  .transform((value) =>
    value === undefined || value.trim() === '' ? undefined : value,
  );

const ownerEnvSchema = z.object({
  [OWNER_ENV_KEYS.email]: optionalText,
  [OWNER_ENV_KEYS.displayName]: optionalText,
});

export interface OwnerEnv {
  readonly email: string;
  readonly displayName: string | undefined;
}

/**
 * The only reader of OWNER_EMAIL and OWNER_DISPLAY_NAME. Used by the
 * `owner:bootstrap` CLI; the API's env schema never sees these keys.
 */
export function readOwnerEnv(env: NodeJS.ProcessEnv): OwnerEnv {
  const parsed = ownerEnvSchema.parse(env);
  const email = parsed[OWNER_ENV_KEYS.email];
  if (email === undefined) {
    throw new CliInputError(`${OWNER_ENV_KEYS.email} is required.`);
  }
  return { email, displayName: parsed[OWNER_ENV_KEYS.displayName] };
}

/** The identity use cases the CLIs run, built without Nest. */
export interface IdentityCliUseCases {
  readonly ownerBootstrap: OwnerBootstrapService;
  readonly twoFactorReset: TwoFactorResetService;
  readonly seedAccount: SeedAccountService;
}

/**
 * Wires the use cases on `prisma`. Audit rows go through `writeAuditLog`
 * (transitional, removed in CR-cl-1), so no config is needed here.
 */
export function identityUseCasesOf(prisma: PrismaClient): IdentityCliUseCases {
  const accounts = new PrismaAccountRepository(prisma);
  const runner = new PrismaTransactionRunner(prisma, new NestAppLogger());
  const audit: AuditRecorder = {
    record: (unit, entry) => writeAuditLog(prismaTxOf(unit), entry),
  };
  const sessions = new SessionRevocationService(
    new PrismaSessionRevocationRepository(),
    new Clock(),
  );
  return {
    ownerBootstrap: new OwnerBootstrapService(accounts, runner, audit),
    twoFactorReset: new TwoFactorResetService(
      accounts,
      runner,
      sessions,
      audit,
    ),
    seedAccount: new SeedAccountService(accounts, runner, audit),
  };
}

export interface IdentityCli extends IdentityCliUseCases {
  /** For `db:seed`, which runs the access role seeds on it. */
  readonly prisma: PrismaClient;
  /** Closes the database connection the use cases run on. */
  close(): Promise<void>;
}

/** Opens its own connection for one CLI run. Call `close()` when done. */
export function openIdentityCli(config: IAppConfig): IdentityCli {
  const { prisma, close } = openPrisma(config.database);
  return { ...identityUseCasesOf(prisma), prisma, close };
}
