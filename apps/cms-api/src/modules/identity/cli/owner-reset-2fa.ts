import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';

import { loadAppConfig } from '../../../config/app-config';
import { openPrisma } from '../../../infrastructure/database/prisma-client';
import { CONFIRM_ANSWERS, RESET_2FA_OPTIONS } from '../identity.constants';
import { parseResetEmail, resetTwoFactor } from '../two-factor-reset';
import { CliInputError } from './password-input';

const YES_FLAG = `--${RESET_2FA_OPTIONS.YES}`;
const EMAIL_FLAG = `--${RESET_2FA_OPTIONS.EMAIL}`;

export interface ResetArgs {
  email: string;
  yes: boolean;
}

/** `--email <address> [--yes]`. Unknown options and stray values are refused. */
export function parseResetArgs(argv: readonly string[]): ResetArgs {
  let values: { email?: string | undefined; yes?: boolean | undefined };
  try {
    ({ values } = parseArgs({
      args: [...argv],
      options: {
        [RESET_2FA_OPTIONS.EMAIL]: { type: 'string' },
        [RESET_2FA_OPTIONS.YES]: { type: 'boolean' },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch {
    throw new CliInputError(
      `Usage: owner:reset-2fa ${EMAIL_FLAG} <address> [${YES_FLAG}]`,
    );
  }
  const email = values[RESET_2FA_OPTIONS.EMAIL];
  if (email === undefined || email.trim() === '') {
    throw new CliInputError(`${EMAIL_FLAG} is required.`);
  }
  return { email, yes: values[RESET_2FA_OPTIONS.YES] === true };
}

/** True for "y" / "yes" (any case); anything else, Enter included, is no. */
export function isConfirmed(answer: string): boolean {
  return (CONFIRM_ANSWERS as readonly string[]).includes(
    answer.trim().toLowerCase(),
  );
}

async function confirm(email: string): Promise<boolean> {
  if (process.stdin.isTTY !== true) {
    throw new CliInputError(
      `No terminal for the confirmation prompt. Pass ${YES_FLAG} to confirm.`,
    );
  }
  const prompt = createInterface({
    input: process.stdin,
    output: process.stderr,
  });
  try {
    return isConfirmed(
      await prompt.question(
        `Turn off 2FA and end all sessions for ${email}? [y/N] `,
      ),
    );
  } catch {
    // Ctrl+C / Ctrl+D at the prompt: treat as no.
    return false;
  } finally {
    prompt.close();
  }
}

/**
 * `owner:reset-2fa` (T13a): break-glass recovery for a lost authenticator.
 * Turns 2FA off for one account (any role, the owner included) and ends all
 * its sessions. Asks for confirmation on a terminal; elsewhere `--yes` is
 * required. Prints no secrets. Exit 1 on any refusal (unknown account, 2FA
 * already off, no confirmation), like owner:bootstrap.
 */
async function main(): Promise<void> {
  const config = loadAppConfig(process.env);
  const args = parseResetArgs(process.argv.slice(2));
  const email = parseResetEmail(args.email);
  if (!args.yes && !(await confirm(email))) {
    throw new CliInputError('Cancelled. Nothing changed.');
  }

  const { prisma, close } = openPrisma(config.database);
  try {
    const result = await resetTwoFactor(prisma, email);
    process.stdout.write(
      `Two-factor authentication turned off for ${result.email} (was ${result.previousMethod ?? 'unknown'}). All sessions ended.\n`,
    );
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
