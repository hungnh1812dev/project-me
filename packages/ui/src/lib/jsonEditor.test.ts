import { tags } from '@lezer/highlight';
import { describe, expect, it } from 'vitest';

import {
  canFormat,
  disabledThemeSpec,
  editorSizeSpec,
  editorThemeSpec,
  highlightSpec,
  needsExternalSync,
  shouldValidate,
  SYNTAX_TOKENS,
} from './jsonEditor';

const COLOUR_PROPS = ['color', 'backgroundColor', 'caretColor', 'borderLeftColor', 'borderColor'];
const VAR_ONLY = /^var\(--[a-z][\w-]*\)$/;

const styleValues = (spec: Record<string, Record<string, string>>): [string, string][] =>
  Object.values(spec).flatMap((rules) => Object.entries(rules));

describe('shouldValidate', () => {
  it('validates only after the first blur', () => {
    expect(shouldValidate(false)).toBe(false);
    expect(shouldValidate(true)).toBe(true);
  });
});

describe('canFormat', () => {
  const editable = { disabled: false, readOnly: false };

  it('allows valid, non-empty JSON in an editable field', () => {
    expect(canFormat('{"a":1}', editable)).toBe(true);
    expect(canFormat('[1, 2]', {})).toBe(true);
  });

  it('refuses empty or whitespace-only text', () => {
    expect(canFormat('', editable)).toBe(false);
    expect(canFormat('  \n ', editable)).toBe(false);
  });

  it('refuses invalid JSON', () => {
    expect(canFormat('{"a":', editable)).toBe(false);
  });

  it('refuses disabled or read-only fields', () => {
    expect(canFormat('{"a":1}', { disabled: true })).toBe(false);
    expect(canFormat('{"a":1}', { readOnly: true })).toBe(false);
  });
});

describe('needsExternalSync', () => {
  it('syncs when a controlled value differs from the editor text', () => {
    expect(needsExternalSync('{}', '{"a":1}')).toBe(true);
  });

  it('does not sync when they match', () => {
    expect(needsExternalSync('{"a":1}', '{"a":1}')).toBe(false);
  });

  it('does not sync an uncontrolled editor', () => {
    expect(needsExternalSync('{"a":1}', undefined)).toBe(false);
  });
});

describe('SYNTAX_TOKENS', () => {
  it('maps each syntax class to its colour token', () => {
    expect(SYNTAX_TOKENS).toEqual({
      propertyName: 'primary-ink',
      string: 'success',
      number: 'warning',
      bool: 'highlight',
      null: 'highlight',
      punctuation: 'muted-foreground',
    });
  });
});

describe('highlightSpec', () => {
  it('colours every syntax class through its token variable', () => {
    const byTag = new Map(highlightSpec.map((rule) => [rule.tag, rule.color]));

    expect(byTag.get(tags.propertyName)).toBe('var(--primary-ink)');
    expect(byTag.get(tags.string)).toBe('var(--success)');
    expect(byTag.get(tags.number)).toBe('var(--warning)');
    expect(byTag.get(tags.bool)).toBe('var(--highlight)');
    expect(byTag.get(tags.null)).toBe('var(--highlight)');
    expect(byTag.get(tags.punctuation)).toBe('var(--muted-foreground)');
  });

  it('uses var(--…) only (AC-4)', () => {
    for (const rule of highlightSpec) expect(rule.color).toMatch(VAR_ONLY);
  });
});

describe('editorThemeSpec', () => {
  it('uses var(--…) for every colour (AC-4)', () => {
    const colours = styleValues(editorThemeSpec).filter(([prop]) => COLOUR_PROPS.includes(prop));

    expect(colours.length).toBeGreaterThan(0);
    for (const [, value] of colours) expect(value).toMatch(VAR_ONLY);
  });

  it('has no raw hex, rgb or hsl colour anywhere', () => {
    for (const [, value] of styleValues(editorThemeSpec))
      expect(value).not.toMatch(/#[0-9a-f]{3,8}\b|\b(?:rgb|hsl)a?\(/i);
  });

  it('maps the editor surfaces to the design tokens', () => {
    expect(editorThemeSpec['&']).toMatchObject({
      backgroundColor: 'var(--background)',
      color: 'var(--foreground)',
    });
    expect(editorThemeSpec['.cm-gutters']).toMatchObject({
      backgroundColor: 'var(--muted)',
      color: 'var(--muted-foreground)',
    });
    expect(editorThemeSpec['.cm-content']).toMatchObject({ caretColor: 'var(--foreground)' });
    expect(editorThemeSpec['.cm-cursor, .cm-dropCursor']).toMatchObject({
      borderLeftColor: 'var(--foreground)',
    });
    expect(
      editorThemeSpec[
        '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection'
      ],
    ).toMatchObject({ backgroundColor: 'var(--accent)' });
  });

  it('uses the mono font variable', () => {
    expect(editorThemeSpec['.cm-scroller']?.fontFamily).toMatch(/^var\(--font-mono\b/);
  });
});

describe('disabledThemeSpec', () => {
  it('switches the editor surface to the muted token (AC-19)', () => {
    expect(disabledThemeSpec).toEqual({ '&': { backgroundColor: 'var(--muted)' } });
  });
});

describe('editorSizeSpec', () => {
  it('sizes the editor to about `rows` lines and caps it at 24rem', () => {
    expect(editorSizeSpec(6)).toEqual({
      '.cm-scroller': { minHeight: '9rem', maxHeight: '24rem', overflow: 'auto' },
    });
  });

  it('falls back to one line for non-positive rows', () => {
    expect(editorSizeSpec(0)['.cm-scroller']?.minHeight).toBe('1.5rem');
  });
});
