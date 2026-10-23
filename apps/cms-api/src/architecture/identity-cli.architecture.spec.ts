import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { listSourceFiles, reachedFilesOf } from './import-graph';

/**
 * SPEC D1 / D17 (SEC-AU5 S6): the smoke seed CLI is not part of the app
 * graph. No file outside `modules/identity/cli/` imports or re-exports it,
 * the identity facade included.
 */
const SRC_ROOT = join(__dirname, '..');
const CLI_DIRECTORY = join('modules', 'identity', 'cli') + '/';
const PROTECTED_FILE = join('modules', 'identity', 'cli', 'seed-account.ts');

function findOutsideReachers(root: string, protectedFile: string): string[] {
  return listSourceFiles(root)
    .filter(({ file }) => !file.startsWith(CLI_DIRECTORY))
    .filter((source) => reachedFilesOf(root, source).has(protectedFile))
    .map(({ file }) => file);
}

describe('smoke seed CLI stays out of the app graph (S6)', () => {
  it('scans the source tree and the file the rule protects', () => {
    const all = listSourceFiles(SRC_ROOT).map(({ file }) => file);
    expect(all).toContain(PROTECTED_FILE);
  });

  it('no source file outside identity/cli reaches seed-account.ts', () => {
    expect(findOutsideReachers(SRC_ROOT, PROTECTED_FILE)).toEqual([]);
  });

  describe('the guard itself', () => {
    let root: string;
    const write = (file: string, text: string) => {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), text);
    };

    beforeEach(() => {
      root = mkdtempSync(join(tmpdir(), 'identity-cli-'));
      write(PROTECTED_FILE, 'export const seedAccount = 1;');
    });
    afterEach(() => rmSync(root, { recursive: true, force: true }));

    it('fails on a direct import and on a facade re-export', () => {
      write(
        'modules/identity/index.ts',
        "export { seedAccount } from './cli/seed-account';",
      );
      write(
        'modules/graphql/resolver.ts',
        "import { seedAccount } from '../identity/cli/seed-account';",
      );
      expect(findOutsideReachers(root, PROTECTED_FILE).sort()).toEqual([
        'modules/graphql/resolver.ts',
        'modules/identity/index.ts',
      ]);
    });

    it('passes when only cli files use it', () => {
      write(
        'modules/identity/cli/other.ts',
        "import { seedAccount } from './seed-account';",
      );
      expect(findOutsideReachers(root, PROTECTED_FILE)).toEqual([]);
    });
  });
});
