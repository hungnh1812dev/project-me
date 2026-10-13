/** The JSON value kind a field accepts. */
export type JsonExpect = 'object' | 'array' | 'any';

export interface ParseJsonOptions {
  required?: boolean;
  expect?: JsonExpect;
}

export type ParseJsonResult =
  { ok: true; value: unknown } | { ok: false; message: string; line?: number; column?: number };

export interface JsonErrorDescription {
  reason: string;
  line?: number;
  column?: number;
}

const LINE_COLUMN = /\bline (\d+) column (\d+)/;
const POSITION = /\bat position (\d+)/;

/** 1-based line and column of a 0-based character offset in `text`. */
function locate(text: string, position: number): { line: number; column: number } {
  const before = text.slice(0, position);
  const line = before.split('\n').length;
  return { line, column: position - before.lastIndexOf('\n') };
}

/**
 * Turns an engine `SyntaxError` message into a short reason plus, when the engine reports a
 * position, a 1-based line and column. Handles V8, Firefox and Safari wording.
 */
export function describeJsonError(message: string, text: string): JsonErrorDescription {
  const reason = message
    .replace(/^JSON\.parse: /, '')
    .replace(/^JSON Parse error: /, '')
    // `[\s\S]` instead of the `s` flag: frontend typechecks this file with target ES2017.
    .replace(/, "[\s\S]*" is not valid JSON$/, '')
    .replace(/ in JSON at position \d+[\s\S]*$/, '')
    .replace(/ at line \d+ column \d+ of the JSON data$/, '');

  const lineColumn = LINE_COLUMN.exec(message);
  if (lineColumn) return { reason, line: Number(lineColumn[1]), column: Number(lineColumn[2]) };
  const position = POSITION.exec(message);
  if (position) return { reason, ...locate(text, Number(position[1])) };
  return { reason };
}

function checkKind(value: unknown, expect: JsonExpect): string | null {
  if (expect === 'object' && (value === null || typeof value !== 'object' || Array.isArray(value)))
    return 'Expected a JSON object.';
  if (expect === 'array' && !Array.isArray(value)) return 'Expected a JSON array.';
  return null;
}

/**
 * Parses JSON field text. Empty text is valid (`value: undefined`) unless `required`.
 * Errors carry the message the field shows.
 */
export function parseJson(text: string, options: ParseJsonOptions = {}): ParseJsonResult {
  const { required = false, expect = 'any' } = options;
  if (text.trim() === '') {
    return required
      ? { ok: false, message: 'This field is required.' }
      : { ok: true, value: undefined };
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    const { reason, line, column } = describeJsonError(error.message, text);
    if (line === undefined || column === undefined) {
      return { ok: false, message: `Invalid JSON: ${reason}` };
    }
    return {
      ok: false,
      message: `Invalid JSON: ${reason} (line ${line}, column ${column})`,
      line,
      column,
    };
  }

  const kindError = checkKind(value, expect);
  return kindError ? { ok: false, message: kindError } : { ok: true, value };
}

/** Pretty-prints valid JSON text with 2-space indentation; returns other text unchanged. */
export function formatJson(text: string): string {
  const result = parseJson(text);
  if (!result.ok || result.value === undefined) return text;
  return JSON.stringify(result.value, null, 2);
}
