import { loadAppConfig } from '../../../config/app-config';
import { openPrisma } from '../../../infrastructure/database/prisma-client';
import { OWNER_CREATED_CHANNELS } from '../../security-audit';
import { PASSWORD_STDIN_FLAG } from '../identity.constants';
import { bootstrapOwner } from '../owner-bootstrap';
import {
  CliInputError,
  promptHidden,
  readPasswordFromStream,
} from './password-input';
import { readOwnerEnv } from './read-owner-env';

/**
 * `owner:bootstrap` (D1): creates the single owner. Email from OWNER_EMAIL
 * (display name from OWNER_DISPLAY_NAME, optional). The password is typed at
 * a hidden prompt (twice), or piped with `--password-stdin` where there is no
 * terminal. It is never taken from argv or env, and never printed.
 */
async function readPassword(argv: readonly string[]): Promise<string> {
  if (argv.includes(PASSWORD_STDIN_FLAG)) {
    return readPasswordFromStream(process.stdin);
  }
  if (process.stdin.isTTY !== true) {
    throw new CliInputError(
      `No terminal for the password prompt. Pipe it with ${PASSWORD_STDIN_FLAG}.`,
    );
  }
  const first = await promptHidden(
    process.stdin,
    process.stderr,
    'Owner password: ',
  );
  const second = await promptHidden(
    process.stdin,
    process.stderr,
    'Repeat password: ',
  );
  if (first !== second) throw new CliInputError('Passwords do not match.');
  return first;
}

async function main(): Promise<void> {
  const config = loadAppConfig(process.env);
  const { email, displayName } = readOwnerEnv(process.env);
  const password = await readPassword(process.argv.slice(2));

  const { prisma, close } = openPrisma(config.database);
  try {
    const owner = await bootstrapOwner(
      prisma,
      {
        email,
        displayName,
        password,
      },
      { channel: OWNER_CREATED_CHANNELS.CLI },
    );
    process.stdout.write(`Owner account created: ${owner.email}\n`);
  } finally {
    await close();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
