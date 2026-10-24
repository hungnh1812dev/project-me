import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC_DIR = join(process.cwd(), 'src');
const COMPONENTS_DIR = join(process.cwd(), 'src', 'components');
const FIELD_WIRING_FILE = join('forms', 'field-wiring.ts');
const CONTROL_CONSTANTS_FILE = join('ui', 'control.constants.ts');

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return listSourceFiles(path);
    return /\.tsx?$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry)
      ? [path]
      : [];
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

  it('names every component folder after the file that holds the component', () => {
    const formsDir = join(COMPONENTS_DIR, 'forms');
    const foldersWithoutOwnFile = readdirSync(formsDir)
      .filter((entry) => statSync(join(formsDir, entry)).isDirectory())
      .filter(
        (folder) =>
          !readdirSync(join(formsDir, folder)).includes(`${folder}.tsx`),
      );
    expect(foldersWithoutOwnFile).toEqual([]);
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

// Comments describe the code, not the backlog: task and question IDs rot once
// the backlog is archived. SPEC IDs (`D9`, `§9`) stay and are not matched.
const BACKLOG_ID = /\b(T\d{1,3}[a-z]?|OS\d+|Q-?[A-Z]*\d+)\b/;
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;
const LINE_COMMENT = /(?:^|\s)\/\/.*$/gm;

function backlogIdsInComments(text: string): string[] {
  const comments = [
    ...(text.match(BLOCK_COMMENT) ?? []),
    ...(text.match(LINE_COMMENT) ?? []),
  ];
  return comments.flatMap((comment) =>
    comment
      .split('\n')
      .map((line) => BACKLOG_ID.exec(line)?.[1])
      .filter((id): id is string => id !== undefined),
  );
}

describe('comments carry no backlog IDs', () => {
  it('no non-test source comment names a task, question or OS ID', () => {
    const offenders = listSourceFiles(SRC_DIR)
      .map((file) => ({
        file: file.replace(SRC_DIR, ''),
        ids: backlogIdsInComments(readFileSync(file, 'utf8')),
      }))
      .filter(({ ids }) => ids.length > 0);
    expect(offenders).toEqual([]);
  });

  describe('the guard itself', () => {
    it('flags task, question and OS IDs in block, doc and line comments', () => {
      expect(backlogIdsInComments('/** Throttle (T10a). */')).toEqual(['T10a']);
      expect(backlogIdsInComments('const a = 1; // see Q-G4')).toEqual([
        'Q-G4',
      ]);
      expect(backlogIdsInComments('/*\n * OS4 walk\n * and Q5\n */')).toEqual([
        'OS4',
        'Q5',
      ]);
    });

    it('ignores SPEC IDs, section marks, 2fa and code outside comments', () => {
      expect(
        backlogIdsInComments('/** SPEC D9, D14 and §9 for 2fa. */'),
      ).toEqual([]);
      expect(backlogIdsInComments('Date.parse(`${raw}T00:00:00Z`);')).toEqual(
        [],
      );
      expect(backlogIdsInComments("const kind = 'T10';")).toEqual([]);
      expect(backlogIdsInComments("fetch('https://x.test/T10')")).toEqual([]);
    });
  });
});
