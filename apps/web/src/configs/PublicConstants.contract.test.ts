import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  API_ERROR_CODES,
  LOGIN_CODE_LENGTH,
  READ_ACTION,
} from './Auth.constants';
import {
  REVIEWER_ERROR_CODES,
  REVIEWER_INPUT_LIMITS,
} from './Reviewer.constants';

interface PublicConstants {
  otp: { digits: number };
  totp: { digits: number };
  reviewerInputLimits: Record<string, number>;
  errorCodes: {
    auth: Record<string, string>;
    reviewer: Record<string, string>;
  };
  permissionActions: string[];
}

const published: PublicConstants = JSON.parse(
  readFileSync(
    resolve(process.cwd(), '../cms-api/content/public-constants.json'),
    'utf8',
  ),
) as PublicConstants;

describe('web constants against the cms-api public constants', () => {
  it('uses the one login code length of the email and authenticator codes', () => {
    expect(LOGIN_CODE_LENGTH).toBe(published.otp.digits);
    expect(LOGIN_CODE_LENGTH).toBe(published.totp.digits);
  });

  it('matches the reviewer input limits in both directions', () => {
    expect({ ...REVIEWER_INPUT_LIMITS }).toEqual(published.reviewerInputLimits);
  });

  it('matches the reviewer error codes in both directions', () => {
    expect({ ...REVIEWER_ERROR_CODES }).toEqual(published.errorCodes.reviewer);
  });

  it('uses published auth codes and the published read action', () => {
    const publishedAuth = Object.values(published.errorCodes.auth);
    for (const code of Object.values(API_ERROR_CODES)) {
      expect(publishedAuth).toContain(code);
    }
    expect(published.permissionActions).toContain(READ_ACTION);
  });
});
