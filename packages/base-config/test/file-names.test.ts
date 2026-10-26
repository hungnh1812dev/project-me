import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * ADR 0008: every TypeScript file is `<PascalName>.<function>.ts`, with
 * `.test.ts` appended for its test. A new function word is one entry in
 * `FILE_FUNCTION_WORDS`; a renamed file leaves `KNOWN_FILE_NAME_EXCEPTIONS`,
 * which only shrinks (a stale entry fails).
 */
const FILE_FUNCTION_WORDS = ['setup', 'constants', 'fixture'];
const FRAMEWORK_FILE_NAMES = ['index.ts'];
const TOOL_CONFIG_SUFFIX = '.config.ts';
const SCANNED_DIRECTORIES = ['src', 'test'];
const KNOWN_FILE_NAME_EXCEPTIONS = [
  'src/eslint.ts',
  'src/oxlint.ts',
  'src/prettier.ts',
  'test/config.test.ts',
  'test/file-names.test.ts',
];

const PACKAGE_ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const TEST_SUFFIX = '.test.ts';
const SOURCE_SUFFIX = '.ts';
const FILE_NAME_SHAPE = new RegExp(
  `^[A-Z][A-Za-z0-9]*\\.(${FILE_FUNCTION_WORDS.join('|')})$`,
);

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listTypeScriptFiles(path);
    return entry.name.endsWith(SOURCE_SUFFIX) ? [path] : [];
  });
}

function followsNamingRule(fileName: string): boolean {
  if (FRAMEWORK_FILE_NAMES.includes(fileName)) return true;
  if (fileName.endsWith(TOOL_CONFIG_SUFFIX)) return true;
  const withoutSuffix = fileName.endsWith(TEST_SUFFIX)
    ? fileName.slice(0, -TEST_SUFFIX.length)
    : fileName.slice(0, -SOURCE_SUFFIX.length);
  return FILE_NAME_SHAPE.test(withoutSuffix);
}

const files = SCANNED_DIRECTORIES.flatMap((directory) =>
  listTypeScriptFiles(join(PACKAGE_ROOT, directory)),
).map((path) => relative(PACKAGE_ROOT, path));

await test('accepts and rejects the documented shapes', () => {
  assert.ok(followsNamingRule('Prettier.setup.ts'));
  assert.ok(followsNamingRule('Prettier.setup.test.ts'));
  assert.ok(!followsNamingRule('prettier.ts'));
  assert.ok(!followsNamingRule('Prettier.helper.ts'));
});

await test('every file follows the rule or is a known exception', () => {
  const offenders = files.filter(
    (file) =>
      !followsNamingRule(basename(file)) &&
      !KNOWN_FILE_NAME_EXCEPTIONS.includes(file),
  );
  assert.deepEqual(offenders, []);
});

await test('no known exception is stale', () => {
  const stale = KNOWN_FILE_NAME_EXCEPTIONS.filter(
    (file) => !files.includes(file) || followsNamingRule(basename(file)),
  );
  assert.deepEqual(stale, []);
});
