import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const APPS_FOLDER = resolve(process.cwd(), '..');

function readHelper(appFolder: string, helperFile: string): string {
  return readFileSync(resolve(APPS_FOLDER, appFolder, helperFile), 'utf8');
}

describe('StripTrailingSlashes.rules copies', () => {
  it('stay byte-identical in cms-admin and web', () => {
    expect(readHelper('web', 'src/lib/StripTrailingSlashes.rules.ts')).toBe(
      readHelper('cms-admin', 'src/config/StripTrailingSlashes.rules.ts'),
    );
  });
});
