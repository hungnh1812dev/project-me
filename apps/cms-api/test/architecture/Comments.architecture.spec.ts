import { join } from 'node:path';

import { commentsOf, listSourceFiles } from './ImportGraph.analyzer';

/**
 * Comments describe the code, not the backlog: task and question IDs rot once
 * the backlog is archived. SPEC IDs (`D7`, `§9`) stay and are not matched.
 */
const SRC_ROOT = join(__dirname, '..');
const GENERATED_DIRECTORY = 'generated';
const BACKLOG_ID = /\b(T\d{1,3}[a-z]?|OS\d+|Q-?[A-Z]*\d+)\b/;

function findBacklogIds(text: string): string[] {
  return commentsOf(text).flatMap((comment) =>
    comment
      .split('\n')
      .map((line) => BACKLOG_ID.exec(line)?.[1])
      .filter((id): id is string => id !== undefined),
  );
}

describe('comments carry no backlog IDs', () => {
  it('no non-spec source comment names a task, question or OS ID', () => {
    const offenders = listSourceFiles(SRC_ROOT, {
      excludeDirs: [GENERATED_DIRECTORY],
    })
      .map(({ file, text }) => ({ file, ids: findBacklogIds(text) }))
      .filter(({ ids }) => ids.length > 0);
    expect(offenders).toEqual([]);
  });

  describe('the guard itself', () => {
    it('flags task, question and OS IDs in block, doc and line comments', () => {
      expect(findBacklogIds('/** Throttle (T10a). */')).toEqual(['T10a']);
      expect(findBacklogIds('const a = 1; // see Q-G4')).toEqual(['Q-G4']);
      expect(findBacklogIds('/*\n * OS4 walk\n * and Q5\n */')).toEqual([
        'OS4',
        'Q5',
      ]);
    });

    it('ignores SPEC IDs, section marks, 2fa and code outside comments', () => {
      expect(findBacklogIds('/** SPEC D7, D14 and §9 for 2fa. */')).toEqual([]);
      expect(findBacklogIds('Date.parse(`${raw}T00:00:00Z`);')).toEqual([]);
      expect(findBacklogIds("const kind = 'T10';")).toEqual([]);
    });
  });
});
