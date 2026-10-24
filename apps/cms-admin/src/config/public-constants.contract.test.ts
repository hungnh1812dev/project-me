import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { API_ERROR_CODES, ACCOUNT_LIMITS } from './http.constants';
import {
  OTP_CODE_LENGTH,
  OTP_TTL_MINUTES,
  OWNER_DISPLAY_NAME_MAX_LENGTH,
  PASSWORD_LENGTH,
  SETUP_TOKEN_MAX_LENGTH,
  TOTP_CODE_LENGTH,
  TOTP_PERIOD_SECONDS,
} from './auth.constants';
import { PERMISSION_ACTIONS } from '../lib/permission-action';

interface PublicConstants {
  password: { minLength: number; maxLength: number };
  ownerDisplayNameMaxLength: number;
  setupTokenMaxLength: number;
  otp: { digits: number; ttlSeconds: number };
  totp: { digits: number; periodSeconds: number };
  errorCodes: {
    auth: Record<string, string>;
    ownerSetup: Record<string, string>;
    access: Record<string, string>;
  };
  permissionActions: string[];
}

const SECONDS_PER_MINUTE = 60;

const published: PublicConstants = JSON.parse(
  readFileSync(
    resolve(process.cwd(), '../cms-api/content/public-constants.json'),
    'utf8',
  ),
) as PublicConstants;

/** Published auth codes the admin does not branch on (sent by flows it does not have). */
const AUTH_CODES_NOT_USED_BY_ADMIN = [
  'AUTH_INVALID_REFRESH_TOKEN',
  'AUTH_ORIGIN_NOT_ALLOWED',
  'AUTH_INVALID_REQUEST',
];

/** Published access codes the admin does not branch on. */
const ACCESS_CODES_NOT_USED_BY_ADMIN = [
  'PERMISSION_INVALID_CONDITION',
  'PERMISSION_INVALID_SUBJECT',
  'PERMISSION_INVALID_ACTION',
  'PERMISSION_INVALID_FIELDS',
  'FIELD_NOT_READABLE',
  'FIELD_NOT_WRITABLE',
  'FIELD_UNKNOWN',
];

const adminCodes = Object.values(API_ERROR_CODES) as string[];

describe('admin constants against the cms-api public constants', () => {
  it('matches the password, setup and display-name bounds', () => {
    expect(PASSWORD_LENGTH.MIN).toBe(published.password.minLength);
    expect(PASSWORD_LENGTH.MAX).toBe(published.password.maxLength);
    expect(SETUP_TOKEN_MAX_LENGTH).toBe(published.setupTokenMaxLength);
    expect(OWNER_DISPLAY_NAME_MAX_LENGTH).toBe(
      published.ownerDisplayNameMaxLength,
    );
    expect(ACCOUNT_LIMITS.DISPLAY_NAME_MAX_LENGTH).toBe(
      published.ownerDisplayNameMaxLength,
    );
  });

  it('matches the OTP and TOTP lengths and timing', () => {
    expect(OTP_CODE_LENGTH).toBe(published.otp.digits);
    expect(OTP_TTL_MINUTES * SECONDS_PER_MINUTE).toBe(published.otp.ttlSeconds);
    expect(TOTP_CODE_LENGTH).toBe(published.totp.digits);
    expect(TOTP_PERIOD_SECONDS).toBe(published.totp.periodSeconds);
  });

  it('mirrors every published auth code except the listed ones, and no other AUTH_ code', () => {
    const publishedAuth = Object.values(published.errorCodes.auth);
    const expected = publishedAuth.filter(
      (code) => !AUTH_CODES_NOT_USED_BY_ADMIN.includes(code),
    );
    const mirroredAuth = adminCodes.filter((code) => code.startsWith('AUTH_'));
    expect(mirroredAuth.sort()).toEqual(expected.sort());
    for (const code of AUTH_CODES_NOT_USED_BY_ADMIN) {
      expect(publishedAuth).toContain(code);
    }
  });

  it('mirrors the published owner-setup and token-scope codes', () => {
    expect(adminCodes).toContain(published.errorCodes.ownerSetup.EMAIL_TAKEN);
    expect(adminCodes).toContain(
      published.errorCodes.access.TOKEN_SCOPE_INVALID,
    );
    const publishedAccess = Object.values(published.errorCodes.access);
    for (const code of ACCESS_CODES_NOT_USED_BY_ADMIN) {
      expect(publishedAccess).toContain(code);
      expect(adminCodes).not.toContain(code);
    }
  });

  it('lists the permission actions in the published order', () => {
    expect([...PERMISSION_ACTIONS]).toEqual(published.permissionActions);
  });
});
