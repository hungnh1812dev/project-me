import { TWO_FACTOR_RESET_ERRORS } from './identity.constants';
import { parseResetEmail, TwoFactorResetError } from './two-factor-reset';

function errorOf(email: string): TwoFactorResetError {
  try {
    parseResetEmail(email);
  } catch (error) {
    if (error instanceof TwoFactorResetError) return error;
    throw error;
  }
  throw new Error('expected parseResetEmail to throw');
}

describe('parseResetEmail', () => {
  it('trims and lower-cases the email', () => {
    expect(parseResetEmail('  Owner@Example.COM ')).toBe('owner@example.com');
  });

  it.each(['', '   ', 'not-an-email'])('rejects %j', (email) => {
    expect(errorOf(email).code).toBe(TWO_FACTOR_RESET_ERRORS.INVALID_INPUT);
  });

  it('does not echo the rejected value', () => {
    expect(errorOf('secret-looking-input').message).not.toContain(
      'secret-looking-input',
    );
  });
});
