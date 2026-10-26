import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const FILE_FUNCTION_WORDS: readonly string[] = [
  'e2e',
  'contract',
  'fixture',
  'client',
  'constants',
  'env',
  'endpoints',
  'architecture',
];
const SOURCE_FOLDER = 'src';
const SPEC_FOLDER = 'tests';
const SOURCE_TEST_SUFFIX = 'test';
const SPEC_TEST_SUFFIX = 'spec';
const PASCAL_NAME = /^[A-Z][A-Za-z0-9]*$/;
const VARIANT = /^[a-z][A-Za-z0-9]*$/;
const FOLDER_NAME = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const FILE_EXTENSION = '.ts';
const PACKAGE_ROOT = new URL('..', import.meta.url).pathname;

function expectedTestSuffix(scanFolder: string): string {
  return scanFolder === SPEC_FOLDER ? SPEC_TEST_SUFFIX : SOURCE_TEST_SUFFIX;
}

function checkFileName(scanFolder: string, fileName: string): string | null {
  if (!fileName.endsWith(FILE_EXTENSION)) return 'not a .ts file';
  const parts = fileName.slice(0, -FILE_EXTENSION.length).split('.');
  const lastPart = parts[parts.length - 1] ?? '';
  const isTestFile = [SOURCE_TEST_SUFFIX, SPEC_TEST_SUFFIX].includes(lastPart);
  const [name = '', word = '', ...rest] = isTestFile
    ? parts.slice(0, -1)
    : parts;
  if (scanFolder === SPEC_FOLDER && lastPart !== SPEC_TEST_SUFFIX) {
    return `files under ${SPEC_FOLDER}/ must end .${SPEC_TEST_SUFFIX}.ts`;
  }
  if (isTestFile && lastPart !== expectedTestSuffix(scanFolder)) {
    return `files under ${scanFolder}/ must end .${expectedTestSuffix(scanFolder)}.ts`;
  }
  if (!PASCAL_NAME.test(name)) return 'name is not PascalCase';
  if (!word) return 'function word is missing';
  if (!FILE_FUNCTION_WORDS.includes(word)) {
    return `word "${word}" is not in FILE_FUNCTION_WORDS`;
  }
  if (rest.length > 0 && !isTestFile) return 'only test files take a variant';
  if (!rest.every((variant) => VARIANT.test(variant))) {
    return 'variant is not camelCase';
  }
  return null;
}

function listEntries(folder: string): { path: string; isFolder: boolean }[] {
  return readdirSync(join(PACKAGE_ROOT, folder), {
    withFileTypes: true,
  }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (!entry.isDirectory()) return [{ path, isFolder: false }];
    return [{ path, isFolder: true }, ...listEntries(path)];
  });
}

function collectViolations(): string[] {
  return [SOURCE_FOLDER, SPEC_FOLDER].flatMap((scanFolder) =>
    listEntries(scanFolder).flatMap(({ path, isFolder }) => {
      const baseName = path.split('/').pop() ?? path;
      const problem = isFolder
        ? FOLDER_NAME.test(baseName)
          ? null
          : 'folder is not kebab-case'
        : checkFileName(scanFolder, baseName);
      return problem ? [`${path}: ${problem}`] : [];
    }),
  );
}

await describe('e2e file names (ADR 0008)', () => {
  void it('every file and folder under src/ and tests/ follows the rule', () => {
    assert.deepEqual(collectViolations(), []);
  });

  void it('accepts the shapes the rule allows', () => {
    assert.equal(checkFileName('src', 'Mailpit.client.ts'), null);
    assert.equal(checkFileName('src', 'Env.contract.test.ts'), null);
    assert.equal(checkFileName('src', 'Env.contract.parsing.test.ts'), null);
    assert.equal(checkFileName('tests', 'SideMenu.e2e.spec.ts'), null);
    assert.equal(checkFileName('tests', 'SideMenu.e2e.mobile.spec.ts'), null);
  });

  void it('rejects the shapes the rule forbids', () => {
    assert.ok(checkFileName('src', 'bad-name.ts'));
    assert.ok(checkFileName('src', 'Helper.ts'));
    assert.ok(checkFileName('src', 'Mailpit.service.ts'));
    assert.ok(checkFileName('src', 'useSession.fixture.ts'));
    assert.ok(checkFileName('src', 'Session.fixture.spec.ts'));
    assert.ok(checkFileName('src', 'Session.fixture.extra.ts'));
    assert.ok(checkFileName('tests', 'SideMenu.e2e.test.ts'));
    assert.ok(checkFileName('tests', 'SideMenu.e2e.ts'));
  });
});
