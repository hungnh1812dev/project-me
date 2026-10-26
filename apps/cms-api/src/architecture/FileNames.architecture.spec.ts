import { readdirSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';

import {
  FILE_FUNCTION_WORDS,
  FOLDER_NAME_SHAPE,
  FRAMEWORK_FILE_NAMES,
  SCANNED_DIRECTORIES,
  SKIPPED_DIRECTORIES,
} from './FileNames.constants';

/**
 * ADR 0008: every TypeScript file is `<PascalName>.<function>.ts`, with
 * `.spec.ts` appended for its test and an optional lower-case scenario
 * variant before it (`Auth.service.refresh.spec.ts`). Folders are kebab-case.
 */
const PACKAGE_ROOT = join(__dirname, '..', '..');
const SPEC_SUFFIX = '.spec.ts';
const SOURCE_SUFFIX = '.ts';
const PASCAL_NAME = /^[A-Z][A-Za-z0-9]*$/;
const VARIANT_NAME = /^[a-z][a-z0-9]*$/;

function toPackagePath(absolutePath: string): string {
  return relative(PACKAGE_ROOT, absolutePath).split(sep).join('/');
}

function listEntries(directory: string): {
  files: string[];
  folders: string[];
} {
  const files: string[] = [];
  const folders: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.includes(toPackagePath(path))) continue;
      folders.push(path);
      const nested = listEntries(path);
      files.push(...nested.files);
      folders.push(...nested.folders);
    } else if (entry.name.endsWith(SOURCE_SUFFIX)) {
      files.push(path);
    }
  }
  return { files, folders };
}

function followsNamingRule(fileName: string): boolean {
  if (FRAMEWORK_FILE_NAMES.includes(fileName)) return true;
  const isTest = fileName.endsWith(SPEC_SUFFIX);
  const stem = fileName.slice(
    0,
    -(isTest ? SPEC_SUFFIX : SOURCE_SUFFIX).length,
  );
  const [name, word, variant, ...rest] = stem.split('.');
  if (rest.length > 0 || !PASCAL_NAME.test(name ?? '')) return false;
  if (!FILE_FUNCTION_WORDS.includes(word ?? '')) return false;
  if (variant === undefined) return true;
  return (
    isTest &&
    VARIANT_NAME.test(variant) &&
    !FILE_FUNCTION_WORDS.includes(variant)
  );
}

function followsFolderRule(folderName: string): boolean {
  return FOLDER_NAME_SHAPE.test(folderName);
}

describe('file names (ADR 0008)', () => {
  const entries = SCANNED_DIRECTORIES.map((directory) =>
    listEntries(join(PACKAGE_ROOT, directory)),
  );
  const files = entries.flatMap((entry) => entry.files).map(toPackagePath);
  const folders = entries.flatMap((entry) => entry.folders).map(toPackagePath);

  it('scans the source tree', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('accepts and rejects the documented shapes', () => {
    const accepted = [
      'AccessPolicy.service.ts',
      'AccessPolicy.service.spec.ts',
      'Auth.service.refresh.spec.ts',
      'ImportGraph.architecture.spec.ts',
      'Auth.integration.spec.ts',
      'Identity.module.ts',
      'index.ts',
    ];
    const rejected = [
      'access-policy.service.ts',
      'import-graph.architecture.spec.ts',
      'Richtext.config.ts',
      'AccessPolicy.ts',
      'AccessPolicy.helper.ts',
      'AccessPolicy.service.test.ts',
      'AccessPolicy.service.extra.ts',
      'Auth.service.refresh.ts',
      'Auth.service.constants.spec.ts',
    ];
    expect(accepted.filter((name) => !followsNamingRule(name))).toEqual([]);
    expect(rejected.filter(followsNamingRule)).toEqual([]);
    expect(['content-engine', 'bulk2-action'].every(followsFolderRule)).toBe(
      true,
    );
    expect(['BadFolder', 'bad_folder', '2fa'].some(followsFolderRule)).toBe(
      false,
    );
  });

  it('every folder is kebab-case', () => {
    const offenders = folders.filter(
      (folder) => !followsFolderRule(basename(folder)),
    );
    expect(offenders).toEqual([]);
  });

  it('every file follows the rule', () => {
    const offenders = files.filter(
      (file) => !followsNamingRule(basename(file)),
    );
    expect(offenders).toEqual([]);
  });
});
