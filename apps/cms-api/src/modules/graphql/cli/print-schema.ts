import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { printSchema } from 'graphql';

import { DEFAULT_CONTENT_PATHS } from '../../content-engine';
import { loadDefinitions } from '../../content-engine';
import { GRAPHQL_SDL_FILE_NAME } from '../application/Graphql.constants';
import { buildGraphqlSchema } from '../http/schema/SchemaBuilder.rules';

const UTF8 = 'utf8';

/** The committed SDL, generated and never hand-edited. */
export const DEFAULT_SDL_FILE = join(
  DEFAULT_CONTENT_PATHS.schemasDir,
  '..',
  GRAPHQL_SDL_FILE_NAME,
);

export interface PrintSchemaOptions {
  schemasDir: string;
  sdlFile: string;
  /** Write nothing; report whether the file is up to date. */
  shouldCheckOnly: boolean;
}

export type PrintSchemaResult =
  { status: 'written' | 'up-to-date' | 'stale' } | { status: 'missing' };

/** Reads the file, `undefined` when it does not exist. */
async function readIfPresent(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, UTF8);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

/** The SDL of the definitions in `schemasDir` (no database). */
export async function renderSdl(schemasDir: string): Promise<string> {
  const definitions = await loadDefinitions(schemasDir);
  return `${printSchema(buildGraphqlSchema(definitions))}\n`;
}

/** Writes the SDL, or with `shouldCheckOnly` compares it with the committed file. */
export async function printSchemaFile(
  options: PrintSchemaOptions,
): Promise<PrintSchemaResult> {
  const sdl = await renderSdl(options.schemasDir);
  const current = await readIfPresent(options.sdlFile);
  if (!options.shouldCheckOnly) {
    if (current === sdl) return { status: 'up-to-date' };
    await writeFile(options.sdlFile, sdl, UTF8);
    return { status: 'written' };
  }
  if (current === undefined) return { status: 'missing' };
  return { status: current === sdl ? 'up-to-date' : 'stale' };
}

async function main(): Promise<void> {
  // `pnpm graphql:print-schema -- --check` forwards the `--` separator.
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  const { values } = parseArgs({
    args,
    options: { check: { type: 'boolean', default: false } },
  });
  const result = await printSchemaFile({
    schemasDir: DEFAULT_CONTENT_PATHS.schemasDir,
    sdlFile: DEFAULT_SDL_FILE,
    shouldCheckOnly: values.check,
  });
  switch (result.status) {
    case 'written':
      process.stdout.write(`Wrote ${GRAPHQL_SDL_FILE_NAME}.\n`);
      return;
    case 'up-to-date':
      process.stdout.write(`${GRAPHQL_SDL_FILE_NAME} is up to date.\n`);
      return;
    case 'missing':
    case 'stale':
      process.stderr.write(
        `${GRAPHQL_SDL_FILE_NAME} is ${result.status}: run "pnpm --filter @abyss/cms-api graphql:print-schema" and commit it.\n`,
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
