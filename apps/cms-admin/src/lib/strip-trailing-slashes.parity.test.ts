import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const HELPER_FILE = 'src/lib/strip-trailing-slashes.ts';
const APPS_FOLDER = resolve(process.cwd(), '..');

function readHelperOf(appFolder: string): string {
  return readFileSync(resolve(APPS_FOLDER, appFolder, HELPER_FILE), 'utf8');
}

describe('strip-trailing-slashes copies', () => {
  it('stay byte-identical in cms-admin and web', () => {
    expect(readHelperOf('web')).toBe(readHelperOf('cms-admin'));
  });
});
