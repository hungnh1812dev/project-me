/// <reference types="node" />
// AC-15: CodeMirror ships in its own lazy chunk. Reads the production build in `dist/`, so run
// `pnpm --filter cms-admin build` first; the check is skipped when there is no build.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const DIST = resolve(process.cwd(), 'dist');
const INDEX = join(DIST, 'index.html');
const MARKER = '@codemirror';

/** The `/assets/*.js` file names the page loads up front (the entry chunk and its preloads). */
function entryChunks(html: string): string[] {
  return [...html.matchAll(/(?:src|href)="\/assets\/([^"]+\.js)"/g)].map((match) => match[1]);
}

describe.skipIf(!existsSync(INDEX))('production build chunks (AC-15)', () => {
  it('puts @codemirror in a separate chunk, not in the entry chunk', () => {
    const assets = join(DIST, 'assets');
    const scripts = readdirSync(assets).filter((name) => name.endsWith('.js'));
    const entries = entryChunks(readFileSync(INDEX, 'utf8'));
    const withCodeMirror = scripts.filter((name) =>
      readFileSync(join(assets, name), 'utf8').includes(MARKER),
    );

    expect(entries.length).toBeGreaterThan(0);
    expect(withCodeMirror.length).toBeGreaterThan(0);
    expect(withCodeMirror.filter((name) => entries.includes(name))).toEqual([]);
  });
});
