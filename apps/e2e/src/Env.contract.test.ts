import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const ENV_EXAMPLE_PATH = new URL('../.env.example', import.meta.url);
const STACK_SEED_PATH = new URL(
  '../../../scripts/lib/stack-seed.sh',
  import.meta.url,
);
const ENV_SOURCE_PATH = new URL('./E2e.env.ts', import.meta.url);
const E2E_NAME = /\bE2E_[A-Z0-9_]+\b/g;
const ENV_EXAMPLE_KEY = /^(E2E_[A-Z0-9_]+)=/gm;
const E2E_VARS_ARRAY = /^E2E_VARS=\(([^)]*)\)/m;

function matches(text: string, pattern: RegExp): string[] {
  return [...text.matchAll(pattern)].map((match) => match[1] ?? match[0]);
}

function sorted(names: string[]): string[] {
  return [...new Set(names)].sort();
}

await describe('E2E variable contract', () => {
  const exampleKeys = sorted(
    matches(readFileSync(ENV_EXAMPLE_PATH, 'utf8'), ENV_EXAMPLE_KEY),
  );
  const scriptVars = sorted(
    matches(
      readFileSync(STACK_SEED_PATH, 'utf8').match(E2E_VARS_ARRAY)?.[1] ?? '',
      E2E_NAME,
    ),
  );
  const readerVars = sorted(
    matches(
      [
        ...readFileSync(ENV_SOURCE_PATH, 'utf8').matchAll(
          /requireEnv\('([^']+)'\)/g,
        ),
      ]
        .map((match) => match[1])
        .join(' '),
      E2E_NAME,
    ),
  );

  void it('finds names in every source', () => {
    for (const names of [exampleKeys, scriptVars, readerVars]) {
      assert.notEqual(names.length, 0);
    }
  });

  void it('exports in scripts/lib/stack-seed.sh exactly what .env.example documents', () => {
    assert.deepEqual(scriptVars, exampleKeys);
  });

  void it('reads in E2e.env.ts exactly what the stack scripts export', () => {
    assert.deepEqual(readerVars, scriptVars);
  });
});
