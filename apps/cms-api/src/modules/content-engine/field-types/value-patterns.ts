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
