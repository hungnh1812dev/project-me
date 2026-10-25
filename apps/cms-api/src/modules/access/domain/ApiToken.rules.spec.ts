import { isApiTokenExpired } from './ApiToken.rules';

const NOW_MS = Date.parse('2026-01-01T00:00:00.000Z');

describe('isApiTokenExpired', () => {
  it('never expires without an expiry', () => {
    expect(isApiTokenExpired(null, NOW_MS)).toBe(false);
  });

  it('is expired at the exact expiry instant', () => {
    expect(isApiTokenExpired(new Date(NOW_MS), NOW_MS)).toBe(true);
  });

  it('is expired after the expiry', () => {
    expect(isApiTokenExpired(new Date(NOW_MS - 1), NOW_MS)).toBe(true);
  });

  it('is not expired one millisecond before the expiry', () => {
    expect(isApiTokenExpired(new Date(NOW_MS + 1), NOW_MS)).toBe(false);
  });
});
