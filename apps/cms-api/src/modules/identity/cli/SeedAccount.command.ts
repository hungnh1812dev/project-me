import { parseArgs } from 'node:util';

import { loadAppConfig } from '../../../config/app-config';
import {
  assertRoleAllowed,
  assertSeedAllowed,
  type SeedAccountArgs,
  SeedAccountError,
} from '../application/SeedAccount.service';
import { SEED_ACCOUNT_OPTIONS } from '../domain/Identity.constants';
import { openIdentityCli } from './IdentityCli.setup';
import { CliInputError, readPasswordFromStream } from './PasswordInput.client';

/**
 * `seed:account` (SPEC D1, smoke stacks only): creates one active test
 * account. Never reachable over HTTP: no Nest module imports this file.
 * The password comes from stdin only and is never printed.
 */

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

  const cli = openIdentityCli(loadAppConfig(process.env));
  try {
    const seeded = await cli.seedAccount.seed(
      { ...args, password },
      process.env,
    );
    process.stdout.write(
      `Seeded account: ${seeded.email} (${seeded.roleSlug})\n`,
    );
  } finally {
    await cli.close();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    process.stderr.write(`${messageOf(error)}\n`);
    process.exitCode = 1;
  });
}
