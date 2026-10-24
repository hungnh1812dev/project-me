import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { renderPublicConstants } from './public-constants';

const UTF8 = 'utf8';

export const PUBLIC_CONSTANTS_FILE_NAME = 'public-constants.json';

/**
 * `apps/cms-api/content/public-constants.json`. `src/` and `dist/` sit at
 * the same depth, so the path works for ts-jest and for the built CLI.
 */
export const DEFAULT_PUBLIC_CONSTANTS_FILE = join(
  resolve(__dirname, '..', '..', 'content'),
  PUBLIC_CONSTANTS_FILE_NAME,
);

export interface PrintPublicConstantsOptions {
  file: string;
  /** Write nothing; report whether the file is up to date. */
  check: boolean;
}

export type PrintPublicConstantsResult = {
  status: 'written' | 'up-to-date' | 'stale' | 'missing';
};

async function readIfPresent(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, UTF8);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

/** Writes the snapshot, or with `check` compares it with the committed file. */
export async function printPublicConstants(
  options: PrintPublicConstantsOptions,
): Promise<PrintPublicConstantsResult> {
  const expected = renderPublicConstants();
  const current = await readIfPresent(options.file);
  if (options.check) {
    if (current === undefined) return { status: 'missing' };
    return { status: current === expected ? 'up-to-date' : 'stale' };
  }
  if (current === expected) return { status: 'up-to-date' };
  await writeFile(options.file, expected, UTF8);
  return { status: 'written' };
}

async function main(): Promise<void> {
  // `pnpm contract:print -- --check` forwards the `--` separator.
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  const { values } = parseArgs({
    args,
    options: { check: { type: 'boolean', default: false } },
  });
  const { status } = await printPublicConstants({
    file: DEFAULT_PUBLIC_CONSTANTS_FILE,
    check: values.check,
  });
  switch (status) {
    case 'written':
      process.stdout.write(`Wrote ${PUBLIC_CONSTANTS_FILE_NAME}.\n`);
      return;
    case 'up-to-date':
      process.stdout.write(`${PUBLIC_CONSTANTS_FILE_NAME} is up to date.\n`);
      return;
    case 'missing':
    case 'stale':
      process.stderr.write(
        `${PUBLIC_CONSTANTS_FILE_NAME} is ${status}: run "pnpm --filter @abyss/cms-api contract:print" and commit it.\n`,
      );
      process.exitCode = 1;
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
