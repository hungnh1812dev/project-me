import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * ADR 0008: a file is `<PascalName>[.<function>].ts(x)`, a hook is
 * `use<PascalName>.<query|mutation|state>.ts(x)`, and a test appends an
 * optional lower-case scenario variant and `.test.ts(x)`. A new function word
 * is one entry in `FILE_FUNCTION_WORDS`. Folders are kebab-case.
 */
const FILE_FUNCTION_WORDS = [
  'api',
  'architecture',
  'columns',
  'constants',
  'context',
  'contract',
  'copy',
  'endpoints',
  'env',
  'errors',
  'feature',
  'fixture',
  'form',
  'interceptor',
  'queries',
  'reducer',
  'registry',
  'routes',
  'rules',
  'setup',
  'slice',
  'store',
  'client',
];
const HOOK_FUNCTION_WORDS = ['query', 'mutation', 'state'];
const FRAMEWORK_FILE_NAMES = ['index.ts', 'main.tsx', 'vite-env.d.ts'];
const SCANNED_DIRECTORIES = ['src', 'test'];

const PACKAGE_ROOT = process.cwd();
const PASCAL_NAME = '[A-Z][A-Za-z0-9]*';
const COMPONENT_OR_WORD_FILE = `${PASCAL_NAME}(?:\\.(?:${FILE_FUNCTION_WORDS.join('|')}))?`;
const HOOK_FILE = `use${PASCAL_NAME}\\.(?:${HOOK_FUNCTION_WORDS.join('|')})`;
const ANY_FILE = `(?:${COMPONENT_OR_WORD_FILE}|${HOOK_FILE})`;
const SOURCE_FILE_SHAPE = new RegExp(`^${ANY_FILE}\\.tsx?$`);
const TEST_FILE_SHAPE = new RegExp(
  `^${ANY_FILE}(?:\\.[a-z][a-z0-9]*)?\\.test\\.tsx?$`,
);
const SCRIPT_FILE_SHAPE = /\.tsx?$/;
const FRAMEWORK_TEST_FILE_SHAPE = /^(?:index|main)\.test\.tsx?$/;
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
    } else if (SCRIPT_FILE_SHAPE.test(entry.name)) {
      result.files.push(path);
    }
  }
  return result;
}

function isValidFileName(fileName: string): boolean {
  return (
    FRAMEWORK_FILE_NAMES.includes(fileName) ||
    FRAMEWORK_TEST_FILE_SHAPE.test(fileName) ||
    SOURCE_FILE_SHAPE.test(fileName) ||
    TEST_FILE_SHAPE.test(fileName)
  );
}

function isValidFolderName(folderName: string): boolean {
  return FOLDER_SHAPE.test(folderName);
}

function lastSegment(path: string): string {
  return path.split('/').pop() ?? path;
}

const scanned = SCANNED_DIRECTORIES.map((directory) =>
  scan(join(PACKAGE_ROOT, directory)),
);
const files = scanned.flatMap((entries) => entries.files);
const folders = scanned.flatMap((entries) => entries.folders);

describe('file naming rule (ADR 0008)', () => {
  it('accepts and rejects the documented file shapes', () => {
    for (const valid of [
      'LoginPage.tsx',
      'Access.api.ts',
      'Access.queries.ts',
      'LoginPage.test.tsx',
      'AccountMenu.login.test.tsx',
      'useSetupStatus.query.ts',
      'useSetupStatus.query.test.ts',
      'index.ts',
      'index.test.ts',
      'main.tsx',
      'vite-env.d.ts',
    ]) {
      expect(isValidFileName(valid)).toBe(true);
    }
    for (const invalid of [
      'bad-name.tsx',
      'loginPage.tsx',
      'LoginPage.helper.ts',
      'LoginPage.page.tsx',
      'useSetupStatus.ts',
      'SetupStatus.query.ts',
      'useSetupStatus.api.ts',
      'vite.config.ts',
    ]) {
      expect(isValidFileName(invalid)).toBe(false);
    }
  });

  it('accepts and rejects the documented folder shapes', () => {
    expect(isValidFolderName('content-types')).toBe(true);
    expect(isValidFolderName('BadFolder')).toBe(false);
    expect(isValidFolderName('bad_folder')).toBe(false);
  });

  it('every file follows the naming rule', () => {
    const offenders = files
      .filter((file) => !isValidFileName(lastSegment(file)))
      .map((file) => relative(PACKAGE_ROOT, file));
    expect(offenders).toEqual([]);
  });

  it('every folder is kebab-case', () => {
    const offenders = folders
      .filter((folder) => !isValidFolderName(lastSegment(folder)))
      .map((folder) => relative(PACKAGE_ROOT, folder));
    expect(offenders).toEqual([]);
  });
});
