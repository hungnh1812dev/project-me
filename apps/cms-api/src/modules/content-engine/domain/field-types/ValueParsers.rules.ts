import {
  UUID_PATTERN,
  VALUE_PATTERNS,
  YEAR_ZERO_PREFIX,
} from './ValuePatterns.constants';

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
