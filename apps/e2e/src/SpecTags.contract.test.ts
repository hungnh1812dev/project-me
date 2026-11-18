import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const TESTS_DIR = new URL('../tests/', import.meta.url);
const FLOWS_DIR = new URL('../../../docs/flows/', import.meta.url);
const APPS_DIR = new URL('../../../docs/apps/', import.meta.url);
const SPEC_FILE_SUFFIX = '.e2e.spec.ts';
const TAG_OPTION = /\{\s*tag:\s*\[([^\]]*)\]/g;
const TAG_LITERAL = /'(@[^']*)'/g;

function folderNames(dir: URL): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function tagLists(source: string): string[][] {
  return [...source.matchAll(TAG_OPTION)].map((option) =>
    [...(option[1] ?? '').matchAll(TAG_LITERAL)].map((literal) => literal[1] ?? ''),
  );
}

await describe('e2e spec tags', () => {
  const appNames = folderNames(APPS_DIR);
  const knownNames = new Set([...appNames, ...folderNames(FLOWS_DIR)]);
  const specFiles = readdirSync(TESTS_DIR).filter((name) => name.endsWith(SPEC_FILE_SUFFIX));

  void it('finds the specs and the docs folders', () => {
    assert.ok(specFiles.length > 0, 'no *.e2e.spec.ts file found');
    assert.ok(appNames.length > 0, 'no folder in docs/apps');
  });

  for (const file of specFiles) {
    void it(`${file} carries an app tag and only tags that name a docs/apps or docs/flows folder`, () => {
      const lists = tagLists(readFileSync(new URL(file, TESTS_DIR), 'utf8'));
      assert.ok(lists.length > 0, `${file}: no tag option`);
      for (const tags of lists) {
        const names = tags.map((tag) => tag.slice(1));
        for (const name of names) {
          assert.ok(
            knownNames.has(name),
            `${file}: tag @${name} names no folder in docs/apps or docs/flows`,
          );
        }
        assert.ok(
          names.some((name) => appNames.includes(name)),
          `${file}: a tag option has no app tag (${appNames.map((app) => `@${app}`).join(', ')})`,
        );
      }
    });
  }
});
