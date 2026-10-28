const DATETIME_LOCAL_LENGTH = 16;
const PAD_WIDTH = 2;

const pad = (value: number) => String(value).padStart(PAD_WIDTH, '0');

/** A stored text-like value as form text; null becomes ''. */
export function textToForm(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Form text back to the API; '' means "no value" (null). */
export function textToApi(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

/** A number as text; decimals already arrive as strings. */
export function numberToForm(value: unknown): string {
  return typeof value === 'number' || typeof value === 'string'
    ? String(value)
    : '';
}

/** Integers go to the API as numbers (cms-api limits them to int4). */
export function integerToApi(value: unknown): number | null {
  const text = textToApi(value);
  return text === null ? null : Number(text);
}

export function booleanToForm(value: unknown): boolean {
  return value === true;
}

/** ISO instant -> the local `YYYY-MM-DDTHH:mm` a datetime-local input shows. */
export function datetimeToForm(value: unknown): string {
  if (typeof value !== 'string' || value === '') return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local =
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return local.slice(0, DATETIME_LOCAL_LENGTH);
}

/** Local `YYYY-MM-DDTHH:mm` -> ISO instant with the browser's offset applied. */
export function datetimeToApi(value: unknown): string | null {
  const text = textToApi(value);
  if (text === null) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

const JSON_INDENT = 2;

export function jsonToForm(value: unknown): string {
  return value === null || value === undefined
    ? ''
    : JSON.stringify(value, null, JSON_INDENT);
}

/** Form JSON text -> value; blank or unparsable text is null (validation runs first). */
export function jsonToApi(value: unknown): unknown {
  const text = textToApi(value);
  if (text === null || text.trim() === '') return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
