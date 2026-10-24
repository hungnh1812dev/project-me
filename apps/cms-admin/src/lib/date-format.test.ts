import { describe, expect, it } from 'vitest';

import { formatDate, formatDateTime, formatTime } from './date-format';

const INSTANT = '2026-10-24T08:30:15Z';

describe('date-format', () => {
  it('accepts an ISO string, a Date and a timestamp alike', () => {
    const date = new Date(INSTANT);
    expect(formatDate(INSTANT)).toBe(formatDate(date));
    expect(formatDateTime(date)).toBe(formatDateTime(date.getTime()));
  });

  it('shows the year for dates and seconds for times', () => {
    expect(formatDate(INSTANT)).toContain('2026');
    expect(formatTime(INSTANT)).toMatch(/15/);
  });

  it('shows both the date and the time for date-times', () => {
    expect(formatDateTime(INSTANT)).toContain('2026');
    expect(formatDateTime(INSTANT).length).toBeGreaterThan(
      formatDate(INSTANT).length,
    );
  });
});
