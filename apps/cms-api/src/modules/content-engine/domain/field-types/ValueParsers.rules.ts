/** Postgres `integer` bound: a larger value would be a database error, not a 400. */
export const INT4_MAX = 2_147_483_647;

/** Canonical UUID text form (any version), case-insensitive. */
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Text forms a typed value may take on the wire (API bodies, URL filters, condition literals). */
export const VALUE_PATTERNS = {
  INTEGER: /^-?\d{1,15}$/,
  DECIMAL: /^-?\d{1,30}(?:\.\d{1,12})?$/,
  DATE: /^\d{4}-\d{2}-\d{2}$/,
  DATETIME:
    /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2}))?$/,
} as const;

/** Postgres has no year 0 and rejects it with an error (a 500, not a 400). */
export const YEAR_ZERO_PREFIX = '0000';

/** Length of the `YYYY-MM-DD` start of a date or date-time. */
const DATE_PART_LENGTH = 10;

const hasYearZero = (raw: string) => raw.startsWith(YEAR_ZERO_PREFIX);

/** `YYYY-MM-DD` that is a real calendar day Postgres accepts; `undefined` = invalid. */
export function parseDate(raw: string): string | undefined {
  if (!VALUE_PATTERNS.DATE.test(raw) || hasYearZero(raw)) return undefined;
  const time = Date.parse(`${raw}T00:00:00Z`);
  // `toISOString` throws on an invalid date (month 13), so check first.
  return Number.isFinite(time) && new Date(time).toISOString().startsWith(raw)
    ? raw
    : undefined;
}

/** An ISO date or date-time with an offset, normalized to UTC ISO; `undefined` = invalid. */
export function parseDatetime(raw: string): string | undefined {
  const time = Date.parse(raw);
  // `Date.parse` rolls an impossible day (02-31) over, so the date part is checked on its own.
  return VALUE_PATTERNS.DATETIME.test(raw) &&
    parseDate(raw.slice(0, DATE_PART_LENGTH)) !== undefined &&
    Number.isFinite(time)
    ? new Date(time).toISOString()
    : undefined;
}

/** A UUID in its stored lower-case form; `undefined` = invalid. */
export function parseUuid(raw: string): string | undefined {
  return UUID_PATTERN.test(raw) ? raw.toLowerCase() : undefined;
}
