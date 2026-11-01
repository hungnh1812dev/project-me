import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { RICHTEXT_LINK_PROTOCOLS, RICHTEXT_TEXT_COLORS } from './constants/Richtext.constants';

const published: {
  richtextUrlSchemes: string[];
  richtextTextColors: { name: string; hex: string | null }[];
} = JSON.parse(
  readFileSync(resolve(process.cwd(), '../../apps/cms-api/content/public-constants.json'), 'utf8'),
) as {
  richtextUrlSchemes: string[];
  richtextTextColors: { name: string; hex: string | null }[];
};

describe('kit constants against the cms-api public constants', () => {
  it('accepts the same richtext link schemes as the server allowlist', () => {
    expect(RICHTEXT_LINK_PROTOCOLS).toEqual(published.richtextUrlSchemes);
  });

  it('offers the same text colour palette as the server', () => {
    expect(RICHTEXT_TEXT_COLORS).toEqual(published.richtextTextColors);
  });
});
