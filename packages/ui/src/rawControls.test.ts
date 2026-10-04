import { readdirSync, readFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * AC-10: `apps/cms-admin/src` renders checkboxes and radios only through the `@repo/ui` `Checkbox`
 * and `RadioGroup`, so no `.tsx` there may set `type="checkbox"` or `type="radio"`, and
 * `type="file"` is allowed only inside `FileDropzone`.
 *
 * AC-32: tests query those controls by role and name, never by tag or type, so no unit test or
 * e2e spec in `apps/cms-admin` may use `input[type="checkbox"]`, `input[type="radio"]` or
 * `.indeterminate`.
 */
const RAW_TYPE = /\btype\s*=\s*\{?\s*(['"`])(checkbox|radio|file)\1/g;
const RAW_SELECTOR =
  /input\s*\[\s*type\s*=\s*\\?['"]?(?:checkbox|radio)\\?['"]?\s*\]|\.indeterminate\b/g;

const FILE_INPUT_HOSTS = new Set(['FileDropzone.tsx']);

const rawControlViolations = (source: string, fileName: string): string[] =>
  [...source.matchAll(RAW_TYPE)]
    .filter((m) => m[2] !== 'file' || !FILE_INPUT_HOSTS.has(fileName))
    .map((m) => m[0]);

const testSelectorViolations = (source: string): string[] =>
  [...source.matchAll(RAW_SELECTOR)].map((m) => m[0]);

const listFiles = (dir: string, keep: (name: string) => boolean): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : listFiles(path, keep);
    return keep(entry.name) ? [path] : [];
  });

const isTest = (name: string): boolean => /\.(test|spec)\.tsx?$/.test(name);

const REPO = resolve(import.meta.dirname, '../../..');
const ADMIN = join(REPO, 'apps/cms-admin');
const ADMIN_SRC = join(ADMIN, 'src');
const ADMIN_E2E = join(ADMIN, 'e2e');

describe('rawControlViolations', () => {
  it('flags checkbox, radio and file input types in any quoting', () => {
    const source = `<input type="checkbox" /><input type='radio' /><input type={'file'} /><input type={\`radio\`} />`;

    expect(rawControlViolations(source, 'Thing.tsx')).toEqual([
      'type="checkbox"',
      "type='radio'",
      "type={'file'",
      'type={`radio`',
    ]);
  });

  it('allows a file input only inside FileDropzone, and other input types anywhere', () => {
    expect(rawControlViolations(`<input type="file" />`, 'FileDropzone.tsx')).toEqual([]);
    expect(rawControlViolations(`<input type="radio" />`, 'FileDropzone.tsx')).toEqual([
      'type="radio"',
    ]);
    expect(
      rawControlViolations(
        `<input type="text" /><input type="search" /><Button type="submit" />`,
        'A.tsx',
      ),
    ).toEqual([]);
  });
});

describe('testSelectorViolations', () => {
  it('flags tag-and-type selectors and the indeterminate property', () => {
    const source = [
      `page.locator('input[type="checkbox"]')`,
      `container.querySelector("input[type='radio']")`,
      `qs('input[type=checkbox]')`,
      `"input[type=\\"radio\\"]"`,
      `expect(box.indeterminate).toBe(true)`,
    ].join('\n');

    expect(testSelectorViolations(source)).toHaveLength(5);
  });

  it('allows role queries, file inputs and the mixed state', () => {
    const source = [
      `getByRole('checkbox', { name: 'Read' })`,
      `querySelector('input[type="file"]')`,
      `toHaveAttribute('aria-checked', 'mixed')`,
      `<Checkbox indeterminate />`,
    ].join('\n');

    expect(testSelectorViolations(source)).toEqual([]);
  });
});

describe('cms-admin renders no native checkbox or radio (AC-10)', () => {
  const files = listFiles(ADMIN_SRC, (name) => name.endsWith('.tsx') && !isTest(name));

  it('scans a non-trivial set of files', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it.each(files.map((file) => [relative(REPO, file), file]))('%s', (_name, file) => {
    expect(rawControlViolations(readFileSync(file, 'utf8'), basename(file))).toEqual([]);
  });
});

describe('cms-admin tests query controls by role, not by tag or type (AC-32)', () => {
  const files = [
    ...listFiles(ADMIN_SRC, isTest),
    ...listFiles(ADMIN_E2E, (name) => name.endsWith('.ts')),
  ];

  it('scans the unit tests and the e2e specs', () => {
    expect(files.some((file) => file.endsWith('MediaField.test.tsx'))).toBe(true);
    expect(files.some((file) => file.endsWith('e2e/schema-form.spec.ts'))).toBe(true);
  });

  it.each(files.map((file) => [relative(REPO, file), file]))('%s', (_name, file) => {
    expect(testSelectorViolations(readFileSync(file, 'utf8'))).toEqual([]);
  });
});
