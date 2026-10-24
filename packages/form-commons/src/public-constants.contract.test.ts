import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { RICHTEXT_LINK_PROTOCOLS } from './constants/richtext.constants';

const published: { richtextUrlSchemes: string[] } = JSON.parse(
  readFileSync(
    resolve(process.cwd(), '../../apps/cms-api/content/public-constants.json'),
    'utf8',
  ),
) as { richtextUrlSchemes: string[] };

describe('kit constants against the cms-api public constants', () => {
  it('accepts the same richtext link schemes as the server allowlist', () => {
    expect(RICHTEXT_LINK_PROTOCOLS).toEqual(published.richtextUrlSchemes);
  });
});
