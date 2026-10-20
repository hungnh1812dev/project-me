import { isConfirmed, parseResetArgs } from './owner-reset-2fa';
import { CliInputError } from './password-input';

describe('parseResetArgs', () => {
  it('reads --email and --yes', () => {
    expect(parseResetArgs(['--email', 'a@example.com', '--yes'])).toEqual({
      email: 'a@example.com',
      yes: true,
    });
    expect(parseResetArgs(['--email=a@example.com'])).toEqual({
      email: 'a@example.com',
      yes: false,
    });
  });

  it.each([
    ['no email', []],
    ['an empty email', ['--email', '  ']],
    ['an unknown option', ['--email', 'a@example.com', '--force']],
    ['a stray value', ['a@example.com']],
  ])('refuses %s', (_label, argv) => {
    expect(() => parseResetArgs(argv)).toThrow(CliInputError);
  });
});

describe('isConfirmed', () => {
  it.each(['y', 'Y', 'yes', ' YES '])('takes %j as yes', (answer) => {
    expect(isConfirmed(answer)).toBe(true);
  });

  it.each(['', 'n', 'no', 'yep', 'ok'])('takes %j as no', (answer) => {
    expect(isConfirmed(answer)).toBe(false);
  });
});
