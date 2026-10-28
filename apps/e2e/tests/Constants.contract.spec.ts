import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import {
  NOTES_MAX_LENGTH,
  OTP_DIGITS,
  OTP_IN_MAIL,
  REFRESH_COOKIE_NAME,
  TOTP_PERIOD_SECONDS,
} from '../src/E2e.constants';

interface PublicConstants {
  otp: { digits: number };
  totp: { periodSeconds: number };
  refreshCookieName: string;
  reviewerInputLimits: { NOTES_MAX_LENGTH: number };
}

const PUBLIC_CONSTANTS_PATH = '../cms-api/content/public-constants.json';

const published = JSON.parse(
  readFileSync(resolve(process.cwd(), PUBLIC_CONSTANTS_PATH), 'utf8'),
) as PublicConstants;

/** R3-24c: e2e constants mirror the cms-api public contract snapshot. */
test.describe('e2e constants match the cms-api public constants', () => {
  test('refresh cookie name', () => {
    expect(REFRESH_COOKIE_NAME).toBe(published.refreshCookieName);
  });

  test('reviewer notes limit', () => {
    expect(NOTES_MAX_LENGTH).toBe(
      published.reviewerInputLimits.NOTES_MAX_LENGTH,
    );
  });

  test('TOTP period', () => {
    expect(TOTP_PERIOD_SECONDS).toBe(published.totp.periodSeconds);
  });

  test('email code length', () => {
    expect(OTP_DIGITS).toBe(published.otp.digits);
    const code = '1'.repeat(published.otp.digits);
    expect(OTP_IN_MAIL.exec(`Your code\n${code}\n`)?.[1]).toBe(code);
    expect(OTP_IN_MAIL.exec(`${code}1`)).toBeNull();
  });
});
