import { tags, type Tag } from '@lezer/highlight';

import { parseJson } from './json';

/** A CodeMirror `EditorView.theme` spec: selector → style properties. */
export type EditorStyleSpec = Record<string, Record<string, string>>;

/** One `HighlightStyle.define` rule. */
export interface HighlightRule {
  tag: Tag;
  color: string;
}

/** Validation runs only after the field has been blurred once, then on every change. */
export const shouldValidate = (touched: boolean): boolean => touched;

/** "Format JSON" is enabled for non-empty, valid JSON in an editable field. */
export const canFormat = (
  text: string,
  { disabled = false, readOnly = false }: { disabled?: boolean; readOnly?: boolean },
): boolean => !disabled && !readOnly && text.trim() !== '' && parseJson(text).ok;

/**
 * Whether a controlled `value` must be pushed into the editor. Uncontrolled editors
 * (`value === undefined`) and values the editor already shows are left alone.
 */
export const needsExternalSync = (editorText: string, value: string | undefined): boolean =>
  value !== undefined && value !== editorText;

/**
 * Whether a controlled `value` is a late echo of text the editor itself sent to `onChange`
 * (`sent`, oldest first). Typing can run ahead of the parent's re-render, so an echo of an
 * older text must not be pushed back in (it would undo the newer keystrokes). Removes the
 * echo and everything older from `sent`; a value it never sent clears `sent`.
 */
export const takeOwnEcho = (sent: string[], value: string | undefined): boolean => {
  if (value === undefined) return false;
  const index = sent.indexOf(value);
  sent.splice(0, index === -1 ? sent.length : index + 1);
  return index !== -1;
};

/** The colour token used for each JSON syntax class (AC-24 checks their contrast). */
export const SYNTAX_TOKENS = {
  propertyName: 'primary-ink',
  string: 'success',
  number: 'warning',
  bool: 'highlight',
  null: 'highlight',
  punctuation: 'muted-foreground',
} as const;

const token = (name: string): string => `var(--${name})`;

/** Syntax colours. Custom properties inherit through the shadow root, so themes switch. */
export const highlightSpec: readonly HighlightRule[] = (
  Object.keys(SYNTAX_TOKENS) as (keyof typeof SYNTAX_TOKENS)[]
).map((name) => ({ tag: tags[name], color: token(SYNTAX_TOKENS[name]) }));

const SELECTION =
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection';

/** The editor chrome. Colours are `var(--token)` only (AC-4); the border lives on the host. */
export const editorThemeSpec: EditorStyleSpec = {
  '&': {
    backgroundColor: token('background'),
    color: token('foreground'),
    fontSize: '0.875rem',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'var(--font-mono, ui-monospace, monospace)',
    lineHeight: '1.5rem',
  },
  '.cm-content': { caretColor: token('foreground') },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: token('foreground') },
  [SELECTION]: { backgroundColor: token('accent') },
  '.cm-gutters': {
    backgroundColor: token('muted'),
    color: token('muted-foreground'),
    borderRight: 'none',
  },
  '.cm-activeLineGutter': { backgroundColor: token('accent') },
};

/** Added while the field is disabled (AC-19): the `muted` surface. */
export const disabledThemeSpec: EditorStyleSpec = {
  '&': { backgroundColor: token('muted') },
};

const LINE_HEIGHT_REM = 1.5;

/** About `rows` lines tall at minimum, growing to 24rem before it scrolls. */
export const editorSizeSpec = (rows: number): EditorStyleSpec => ({
  '.cm-scroller': {
    minHeight: `${Math.max(1, rows) * LINE_HEIGHT_REM}rem`,
    maxHeight: '24rem',
    overflow: 'auto',
  },
});
