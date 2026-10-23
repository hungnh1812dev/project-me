import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { envSchema } from './env.schema';

const ENV_EXAMPLE_PATH = join(__dirname, '..', '..', '.env.example');

/** Documented in `.env.example` but read by a CLI, never by the API's schema. */
const CLI_ONLY_ENV_KEYS = ['OWNER_EMAIL', 'OWNER_DISPLAY_NAME'];

const ASSIGNMENT_LINE = /^([A-Z][A-Z0-9_]*)=/;

function exampleKeys(): string[] {
  return readFileSync(ENV_EXAMPLE_PATH, 'utf8')
    .split('\n')
    .flatMap((line) => ASSIGNMENT_LINE.exec(line)?.[1] ?? []);
}

describe('.env.example parity with envSchema', () => {
  const documented = exampleKeys();
  const schemaKeys = Object.keys(envSchema.shape);

  it('documents every schema key', () => {
    expect(schemaKeys.filter((key) => !documented.includes(key))).toEqual([]);
  });

  it('documents no key the schema does not know, except CLI-only keys', () => {
    const unknown = documented.filter(
      (key) => !schemaKeys.includes(key) && !CLI_ONLY_ENV_KEYS.includes(key),
    );
    expect(unknown).toEqual([]);
  });

  it('lists each key once', () => {
    const repeated = documented.filter(
      (key, index) => documented.indexOf(key) !== index,
    );
    expect(repeated).toEqual([]);
  });

  it('keeps every CLI-only key out of the schema and in the example', () => {
    for (const key of CLI_ONLY_ENV_KEYS) {
      expect(schemaKeys).not.toContain(key);
      expect(documented).toContain(key);
    }
  });
});
