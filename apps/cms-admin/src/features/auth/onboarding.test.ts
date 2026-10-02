import { describe, expect, it } from 'vitest';

import {
  emailFromState,
  loginNoticeMessage,
  loginNoticeState,
  registerErrorMessage,
  resendOtpErrorMessage,
  validateEmail,
  validateNewPassword,
  validateOtp,
  validateRegister,
  verifyOtpErrorMessage,
} from './onboarding';

const VALID = {
  name: 'Jane',
  username: 'jane.doe_1',
  email: 'jane@example.com',
  password: '12345678',
};

describe('validateRegister', () => {
  it('accepts a valid form', () => {
    expect(validateRegister(VALID)).toEqual({});
  });

  it('requires a name that is not only spaces', () => {
    expect(validateRegister({ ...VALID, name: '   ' })).toEqual({ name: 'Name is required.' });
  });

  it.each(['ab', 'a'.repeat(33), 'has space', 'bad!char'])(
    'rejects the username %j',
    (username) => {
      expect(validateRegister({ ...VALID, username })).toHaveProperty('username');
    },
  );

  it.each(['abc', 'a'.repeat(32), 'A.b-c_9'])('accepts the username %j', (username) => {
    expect(validateRegister({ ...VALID, username })).toEqual({});
  });

  it.each(['', 'jane', 'jane@', 'jane@example', 'ja ne@example.com'])(
    'rejects the email %j',
    (email) => {
      expect(validateRegister({ ...VALID, email })).toEqual({ email: 'Enter a valid email.' });
    },
  );

  it('requires a password of at least 8 characters', () => {
    expect(validateRegister({ ...VALID, password: '1234567' })).toEqual({
      password: 'Password must be at least 8 characters.',
    });
  });
});

describe('validateEmail', () => {
  it('accepts an address and rejects free text', () => {
    expect(validateEmail('jane@example.com')).toBeNull();
    expect(validateEmail('jane')).toBe('Enter a valid email.');
  });
});

describe('validateOtp', () => {
  it.each([
    ['123456', null],
    ['12345', 'Enter the 6-digit code.'],
    ['1234567', 'Enter the 6-digit code.'],
    ['12a456', 'Enter the 6-digit code.'],
  ])('%j → %j', (otp, expected) => {
    expect(validateOtp(otp)).toBe(expected);
  });
});

describe('validateNewPassword', () => {
  it('accepts a long enough matching pair', () => {
    expect(validateNewPassword('12345678', '12345678')).toBeNull();
  });

  it('rejects a short password', () => {
    expect(validateNewPassword('1234567', '1234567')).toBe(
      'Password must be at least 8 characters.',
    );
  });

  it('rejects a mismatched confirmation', () => {
    expect(validateNewPassword('12345678', '12345679')).toBe('Passwords do not match.');
  });
});

describe('error messages', () => {
  it.each([
    [409, 'Email or username is already in use.'],
    [429, 'Too many attempts. Please try again later.'],
    [500, 'Boom'],
  ])('register %i', (status, expected) => {
    expect(registerErrorMessage({ status, message: 'Boom' })).toBe(expected);
  });

  it.each([
    [400, 'The code is invalid or has expired.'],
    [404, 'No account was found for this email.'],
    [409, 'This email is already verified.'],
    [429, 'Too many attempts. Please try again later.'],
    [500, 'Boom'],
  ])('verify-otp %i', (status, expected) => {
    expect(verifyOtpErrorMessage({ status, message: 'Boom' })).toBe(expected);
  });

  it.each([
    [400, 'Boom'],
    [404, 'No account was found for this email.'],
    [409, 'This email is already verified.'],
    [429, 'Too many attempts. Please try again later.'],
  ])('resend-otp %i', (status, expected) => {
    expect(resendOtpErrorMessage({ status, message: 'Boom' })).toBe(expected);
  });
});

describe('router state helpers', () => {
  it('reads the email carried to /verify-otp', () => {
    expect(emailFromState({ email: 'jane@example.com' })).toBe('jane@example.com');
  });

  it.each([null, undefined, 'x', {}, { email: 42 }])('falls back to empty for %j', (state) => {
    expect(emailFromState(state)).toBe('');
  });

  it('round-trips each login notice', () => {
    expect(loginNoticeMessage(loginNoticeState('verified'))).toBe(
      'Your email is verified. Please sign in.',
    );
    expect(loginNoticeMessage(loginNoticeState('passwordReset'))).toBe(
      'Your password has been reset. Please sign in.',
    );
  });

  it.each([null, {}, { notice: 'other' }, { notice: 'toString' }, { from: '/admin' }])(
    'has no notice for %j',
    (state) => {
      expect(loginNoticeMessage(state)).toBeNull();
    },
  );
});
