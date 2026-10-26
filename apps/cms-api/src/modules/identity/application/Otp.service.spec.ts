import { TEST_ADMIN_ORIGIN } from '../../../../test/fixtures/env.fixture';
import { OTP } from '../domain/Identity.constants';
import { buildOtpMail, isOtpCodeFormat, otpHmac } from './Otp.service';

const PEPPER = 'unit-test-pepper-0123456789abcdef';
const CODE = '042137';
const EMAIL = 'someone@example.test';

describe('otpHmac (D8)', () => {
  it('is a hex HMAC-SHA256 that never contains the code', () => {
    const digest = otpHmac(PEPPER, 1, 'RESET_PASSWORD', CODE);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).not.toContain(CODE);
  });

  it('is bound to the account, the purpose and the pepper', () => {
    const base = otpHmac(PEPPER, 1, 'RESET_PASSWORD', CODE);
    expect(otpHmac(PEPPER, 2, 'RESET_PASSWORD', CODE)).not.toBe(base);
    expect(otpHmac(PEPPER, 1, 'INVITE_SET_PASSWORD', CODE)).not.toBe(base);
    expect(otpHmac(`${PEPPER}x`, 1, 'RESET_PASSWORD', CODE)).not.toBe(base);
    expect(otpHmac(PEPPER, 1, 'RESET_PASSWORD', CODE)).toBe(base);
  });
});

describe('isOtpCodeFormat', () => {
  it.each([CODE, '000000', '999999'])('accepts %s', (code) => {
    expect(isOtpCodeFormat(code)).toBe(true);
  });

  it.each(['', '12345', '1234567', '12a456', ' 123456', '١٢٣٤٥٦'])(
    'rejects %j',
    (code) => {
      expect(isOtpCodeFormat(code)).toBe(false);
    },
  );
});

describe('buildOtpMail', () => {
  it('writes the code, the TTL and the admin page as plain text', () => {
    const message = buildOtpMail(
      EMAIL,
      'RESET_PASSWORD',
      CODE,
      TEST_ADMIN_ORIGIN,
    );
    expect(message.to).toBe(EMAIL);
    expect(message.text).toContain(`\n${CODE}\n`);
    expect(message.text).toContain(`${OTP.TTL_SECONDS / 60} minutes`);
    expect(message.text).toContain(`${TEST_ADMIN_ORIGIN}/reset-password`);
    expect(message.text).not.toMatch(/<a\s|href=/i);
  });

  it('points invites at the set-password page', () => {
    const message = buildOtpMail(
      EMAIL,
      'INVITE_SET_PASSWORD',
      CODE,
      TEST_ADMIN_ORIGIN,
    );
    expect(message.subject).toMatch(/invitation/i);
    expect(message.text).toContain(`${TEST_ADMIN_ORIGIN}/set-password`);
  });

  it('leaves the URL out when the admin origin is unknown', () => {
    const message = buildOtpMail(EMAIL, 'RESET_PASSWORD', CODE, undefined);
    expect(message.text).not.toContain('Enter it at');
  });
});
