import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * ADR 0008: a file is `<PascalName>[.<function>].ts`; its test appends an
 * optional lower-case scenario variant and `.test.ts`. A new function word is
 * one entry in `FILE_FUNCTION_WORDS`. Folders are kebab-case.
 */
const FILE_FUNCTION_WORDS = ['setup', 'constants', 'fixture', 'architecture'];
const FRAMEWORK_FILE_NAMES = ['index.ts'];
const SCANNED_DIRECTORIES = ['src', 'test'];

const PACKAGE_ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const PASCAL_NAME_WITH_WORD = `[A-Z][A-Za-z0-9]*(?:\\.(?:${FILE_FUNCTION_WORDS.join('|')}))?`;
const SOURCE_FILE_SHAPE = new RegExp(`^${PASCAL_NAME_WITH_WORD}\\.ts$`);
const TEST_FILE_SHAPE = new RegExp(
  `^${PASCAL_NAME_WITH_WORD}(?:\\.[a-z][a-z0-9]*)?\\.test\\.ts$`,
);
const FOLDER_SHAPE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

interface ScannedEntries {
  files: string[];
  folders: string[];
}

function scan(directory: string): ScannedEntries {
  const result: ScannedEntries = { files: [], folders: [] };
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = scan(path);
      result.folders.push(path, ...nested.folders);
      result.files.push(...nested.files);
    } else if (entry.name.endsWith('.ts')) {
      result.files.push(path);
    }
  }
  return result;
}

function isValidFileName(fileName: string): boolean {
  return (
    FRAMEWORK_FILE_NAMES.includes(fileName) ||
    SOURCE_FILE_SHAPE.test(fileName) ||
    TEST_FILE_SHAPE.test(fileName)
  );
}

function isValidFolderName(folderName: string): boolean {
  return FOLDER_SHAPE.test(folderName);
}

const scanned = SCANNED_DIRECTORIES.map((directory) =>
  scan(join(PACKAGE_ROOT, directory)),
);
const files = scanned.flatMap((entries) => entries.files);
const folders = scanned.flatMap((entries) => entries.folders);

await test('accepts and rejects the documented file shapes', () => {
  assert.ok(isValidFileName('Prettier.setup.ts'));
  assert.ok(isValidFileName('Prettier.ts'));
  assert.ok(isValidFileName('Prettier.setup.test.ts'));
  assert.ok(isValidFileName('Prettier.formats.test.ts'));
  assert.ok(isValidFileName('Prettier.setup.formats.test.ts'));
  assert.ok(isValidFileName('index.ts'));
  assert.ok(!isValidFileName('prettier.ts'));
  assert.ok(!isValidFileName('Prettier.helper.ts'));
  assert.ok(!isValidFileName('Prettier.formats.ts'));
  assert.ok(!isValidFileName('bad-name.ts'));
  assert.ok(!isValidFileName('vite.config.ts'));
});

await test('accepts and rejects the documented folder shapes', () => {
  assert.ok(isValidFolderName('field-types'));
  assert.ok(!isValidFolderName('FieldTypes'));
  assert.ok(!isValidFolderName('field_types'));
});

await test('every file follows the naming rule', () => {
  const offenders = files
    .filter((file) => !isValidFileName(file.split('/').pop() ?? file))
    .map((file) => relative(PACKAGE_ROOT, file));
  assert.deepEqual(offenders, []);
});

await test('every folder is kebab-case', () => {
  const offenders = folders
    .filter((folder) => !isValidFolderName(folder.split('/').pop() ?? folder))
    .map((folder) => relative(PACKAGE_ROOT, folder));
  assert.deepEqual(offenders, []);
});
