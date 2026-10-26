import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * ADR 0008: a file is `<PascalName>[.<function>].ts(x)`, a hook is
 * `use<PascalName>.<query|mutation|state>.ts(x)`, and a test appends an
 * optional lower-case scenario variant and `.test.ts(x)`. A new function word
 * is one entry in `FILE_FUNCTION_WORDS`. Next.js framework files (`page.tsx`,
 * `layout.tsx`, ...) keep their required lower-case names. Folders are
 * kebab-case, or a Next.js route segment: `[slug]`, `[...slug]`, `(group)`,
 * `@slot`.
 */
const FILE_FUNCTION_WORDS = [
  'api',
  'architecture',
  'client',
  'constants',
  'context',
  'contract',
  'endpoints',
  'env',
  'errors',
  'fixture',
  'form',
  'queries',
  'rules',
  'setup',
];
const HOOK_FUNCTION_WORDS = ['query', 'mutation', 'state'];
const NEXT_FILE_BASE_NAMES = [
  'default',
  'error',
  'global-error',
  'instrumentation',
  'layout',
  'loading',
  'not-found',
  'page',
  'proxy',
  'robots',
  'route',
  'sitemap',
  'template',
];
const FRAMEWORK_FILE_NAMES = [
  'index.ts',
  'next-env.d.ts',
  ...NEXT_FILE_BASE_NAMES.flatMap((base) => [`${base}.ts`, `${base}.tsx`]),
];
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
const FRAMEWORK_TEST_FILE_SHAPE = new RegExp(
  `^(?:index|${NEXT_FILE_BASE_NAMES.join('|')})\\.test\\.tsx?$`,
);
const KEBAB_FOLDER_SHAPE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const NEXT_SEGMENT_FOLDER_SHAPE =
  /^(?:\[{1,2}(?:\.\.\.)?[a-z][A-Za-z0-9]*\]{1,2}|\([a-z][a-z0-9]*(-[a-z0-9]+)*\)|@[a-z][a-z0-9]*(-[a-z0-9]+)*)$/;

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
  return (
    KEBAB_FOLDER_SHAPE.test(folderName) ||
    NEXT_SEGMENT_FOLDER_SHAPE.test(folderName)
  );
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
      'AccountMenu.tsx',
      'Auth.api.ts',
      'Reviewer.queries.ts',
      'AccountMenu.test.tsx',
      'AccountMenu.login.test.tsx',
      'useLiveHealth.query.ts',
      'useLiveHealth.query.test.ts',
      'index.ts',
      'index.test.ts',
      'page.tsx',
      'page.test.tsx',
      'not-found.tsx',
      'layout.tsx',
      'proxy.ts',
      'instrumentation.ts',
      'next-env.d.ts',
    ]) {
      expect(isValidFileName(valid)).toBe(true);
    }
    for (const invalid of [
      'bad-name.tsx',
      'accountMenu.tsx',
      'AccountMenu.helper.ts',
      'AccountMenu.page.tsx',
      'useLiveHealth.ts',
      'LiveHealth.query.ts',
      'useLiveHealth.api.ts',
      'main.tsx',
      'next.config.ts',
    ]) {
      expect(isValidFileName(invalid)).toBe(false);
    }
  });

  it('accepts and rejects the documented folder shapes', () => {
    expect(isValidFolderName('content-types')).toBe(true);
    for (const valid of [
      '[slug]',
      '[...slug]',
      '[[...slug]]',
      '(marketing)',
      '@modal',
    ]) {
      expect(isValidFolderName(valid)).toBe(true);
    }
    expect(isValidFolderName('BadFolder')).toBe(false);
    expect(isValidFolderName('[Slug]')).toBe(false);
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
