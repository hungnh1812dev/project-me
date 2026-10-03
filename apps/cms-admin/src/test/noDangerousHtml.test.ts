/// <reference types="node" />
// AC-34: no React component renders HTML strings. Document data (richtext included) only reaches
// the page as text or through the Tiptap editor, never through `dangerouslySetInnerHTML`.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const SRC = resolve(process.cwd(), 'src');
const PROP = ['dangerously', 'Set', 'Inner', 'HTML'].join('');

/** Every `.tsx` file under `dir`, recursively. */
function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return tsxFiles(path);
    return entry.name.endsWith('.tsx') ? [path] : [];
  });
}

/** The 1-based line numbers of `source` that use the prop. */
function offendingLines(source: string): number[] {
  return source.split('\n').flatMap((line, index) => (line.includes(PROP) ? [index + 1] : []));
}

describe('no dangerouslySetInnerHTML (AC-34)', () => {
  it('finds the prop when a component uses it', () => {
    expect(offendingLines(`const A = () => (\n  <div ${PROP}={{ __html: x }} />\n);`)).toEqual([2]);
    expect(offendingLines('const A = () => <div>{x}</div>;')).toEqual([]);
  });

  it('is used by no .tsx file under src/', () => {
    const files = tsxFiles(SRC);
    expect(files.length).toBeGreaterThan(50);

    const offenders = files.flatMap((file) =>
      offendingLines(readFileSync(file, 'utf8')).map((line) => `${relative(SRC, file)}:${line}`),
    );

    expect(offenders).toEqual([]);
  });
});
