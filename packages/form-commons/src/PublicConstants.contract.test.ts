import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { RICHTEXT_LINK_PROTOCOLS, RICHTEXT_TEXT_COLORS } from './constants/Richtext.constants';
import { HUMAN_CHECK_FORMS, TURNSTILE_TOKEN_FIELD } from './constants/Security.constants';

const published: {
  richtextUrlSchemes: string[];
  richtextTextColors: { name: string; hex: string | null }[];
  humanCheckForms: Record<string, string>;
  humanCheckTokenField: string;
} = JSON.parse(
  readFileSync(resolve(process.cwd(), '../../apps/cms-api/content/public-constants.json'), 'utf8'),
) as {
  richtextUrlSchemes: string[];
  richtextTextColors: { name: string; hex: string | null }[];
  humanCheckForms: Record<string, string>;
  humanCheckTokenField: string;
};

describe('kit constants against the cms-api public constants', () => {
  it('accepts the same richtext link schemes as the server allowlist', () => {
    expect(RICHTEXT_LINK_PROTOCOLS).toEqual(published.richtextUrlSchemes);
  });

  it('offers the same text colour palette as the server', () => {
    expect(RICHTEXT_TEXT_COLORS).toEqual(published.richtextTextColors);
  });

  it('names the same human-check forms as the server', () => {
    expect(HUMAN_CHECK_FORMS).toEqual(published.humanCheckForms);
  });

  it('carries the Turnstile token in the same body field as the server', () => {
    expect(TURNSTILE_TOKEN_FIELD).toBe(published.humanCheckTokenField);
  });
});
