import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import * as kit from './index';
import { PUBLIC_API_SNAPSHOT } from './public-api.snapshot';

const INDEX_SOURCE = readFileSync(
  join(process.cwd(), 'src', 'index.ts'),
  'utf8',
);
const README = readFileSync(join(process.cwd(), 'README.md'), 'utf8');

function exportedTypeNames(source: string): string[] {
  return [...source.matchAll(/\btype (\w+)/g)]
    .flatMap((match) => (match[1] ? [match[1]] : []))
    .sort();
}

describe('kit public API', () => {
  it('exports exactly the snapshot value names', () => {
    expect(Object.keys(kit).sort()).toEqual([...PUBLIC_API_SNAPSHOT.values]);
  });

  it('exports exactly the snapshot type names', () => {
    expect(exportedTypeNames(INDEX_SOURCE)).toEqual([
      ...PUBLIC_API_SNAPSHOT.types,
    ]);
  });

  it('lists every exported value in the README export table', () => {
    const missing = PUBLIC_API_SNAPSHOT.values.filter(
      (name) => !README.includes(`\`${name}\``),
    );
    expect(missing).toEqual([]);
  });
});
