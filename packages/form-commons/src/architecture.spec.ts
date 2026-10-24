import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const COMPONENTS_DIR = fileURLToPath(new URL('./components', import.meta.url));
const FIELD_WIRING_FILE = join('forms', 'field-wiring.ts');
const CONTROL_CONSTANTS_FILE = join('ui', 'control.constants.ts');

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return listSourceFiles(path);
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [path] : [];
  });
}

function filesContaining(needle: string, owner: string): string[] {
  return listSourceFiles(COMPONENTS_DIR)
    .filter((path) => !path.endsWith(owner))
    .filter((path) => readFileSync(path, 'utf8').includes(needle));
}

describe('kit architecture', () => {
  it('keeps the FormProvider guard in field-wiring only', () => {
    expect(
      filesContaining('must be rendered inside', FIELD_WIRING_FILE),
    ).toEqual([]);
  });

  it('builds field helper ids in field-wiring only', () => {
    expect(filesContaining('FIELD_ID_SUFFIX', FIELD_WIRING_FILE)).toEqual([]);
  });

  it('keeps the invalid control classes in control.constants only', () => {
    expect(
      filesContaining(
        'aria-invalid:border-destructive',
        CONTROL_CONSTANTS_FILE,
      ),
    ).toEqual([]);
  });
});
