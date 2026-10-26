import { readdirSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';

import {
  ARCHITECTURE_SPEC_NAME,
  FILE_FUNCTION_WORDS,
  FRAMEWORK_FILE_NAMES,
  KNOWN_FILE_NAME_EXCEPTIONS,
  SCANNED_DIRECTORIES,
  SKIPPED_DIRECTORIES,
  TOOL_CONFIG_SUFFIX,
} from './file-names.constants';

/**
 * ADR 0008: every TypeScript file is `<PascalName>.<function>.ts`, with
 * `.spec.ts` appended for its test. Files that predate the rule sit in
 * `KNOWN_FILE_NAME_EXCEPTIONS`, which only shrinks.
 */
const PACKAGE_ROOT = join(__dirname, '..', '..');
const SPEC_SUFFIX = '.spec.ts';
const SOURCE_SUFFIX = '.ts';
const PASCAL_NAME = '[A-Z][A-Za-z0-9]*';

const FILE_NAME_SHAPE = new RegExp(
  `^${PASCAL_NAME}\\.(${FILE_FUNCTION_WORDS.join('|')})$`,
);

function toPackagePath(absolutePath: string): string {
  return relative(PACKAGE_ROOT, absolutePath).split(sep).join('/');
}

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return SKIPPED_DIRECTORIES.includes(toPackagePath(path))
        ? []
        : listTypeScriptFiles(path);
    }
    return entry.name.endsWith(SOURCE_SUFFIX) ? [path] : [];
  });
}

function followsNamingRule(fileName: string): boolean {
  if (FRAMEWORK_FILE_NAMES.includes(fileName)) return true;
  if (fileName.endsWith(TOOL_CONFIG_SUFFIX)) return true;
  if (ARCHITECTURE_SPEC_NAME.test(fileName)) return true;
  const withoutSpec = fileName.endsWith(SPEC_SUFFIX)
    ? fileName.slice(0, -SPEC_SUFFIX.length)
    : fileName.slice(0, -SOURCE_SUFFIX.length);
  return FILE_NAME_SHAPE.test(withoutSpec);
}

describe('file names (ADR 0008)', () => {
  const files = SCANNED_DIRECTORIES.flatMap((directory) =>
    listTypeScriptFiles(join(PACKAGE_ROOT, directory)),
  ).map(toPackagePath);

  it('scans the source tree', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('accepts and rejects the documented shapes', () => {
    const accepted = [
      'AccessPolicy.service.ts',
      'AccessPolicy.service.spec.ts',
      'Identity.module.ts',
      'index.ts',
      'import-graph.architecture.spec.ts',
    ];
    const rejected = [
      'access-policy.service.ts',
      'AccessPolicy.ts',
      'AccessPolicy.helper.ts',
      'AccessPolicy.service.test.ts',
      'AccessPolicy.service.extra.ts',
    ];
    expect(accepted.filter((name) => !followsNamingRule(name))).toEqual([]);
    expect(rejected.filter(followsNamingRule)).toEqual([]);
  });

  it('every file follows the rule or is a known exception', () => {
    const offenders = files.filter(
      (file) =>
        !followsNamingRule(basename(file)) &&
        !KNOWN_FILE_NAME_EXCEPTIONS.includes(file),
    );
    expect(offenders).toEqual([]);
  });

  it('no known exception is stale', () => {
    const stale = KNOWN_FILE_NAME_EXCEPTIONS.filter(
      (file) => !files.includes(file) || followsNamingRule(basename(file)),
    );
    expect(stale).toEqual([]);
  });
});
