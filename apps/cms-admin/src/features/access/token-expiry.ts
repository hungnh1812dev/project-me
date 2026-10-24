import { END_OF_DAY_TIME } from './access.constants';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_OFFSET = 1;
const PAD_WIDTH = 2;

function pad(value: number): string {
  return String(value).padStart(PAD_WIDTH, '0');
}

/** Local end of the chosen day, or null when `date` is not `YYYY-MM-DD`. */
export function endOfDay(date: string): Date | null {
  if (!DATE_PATTERN.test(date)) return null;
  const result = new Date(`${date}T${END_OF_DAY_TIME}`);
  return Number.isNaN(result.getTime()) ? null : result;
}

/** ISO 8601 (with offset) for the API, or null for an invalid date. */
export function expiryIso(date: string): string | null {
  return endOfDay(date)?.toISOString() ?? null;
}

/** `YYYY-MM-DD` in the user's time zone, for the date input. */
export function localDateOf(iso: string | null): string {
  if (iso === null) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + MONTH_OFFSET)}-${pad(date.getDate())}`;
}
