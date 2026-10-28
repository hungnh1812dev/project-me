import {
  OWNER_BOOTSTRAP_ERRORS,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../domain/Identity.constants';
import { OwnerBootstrapError, parseOwnerInput } from './OwnerBootstrap.service';

const VALID_PASSWORD = 'p'.repeat(PASSWORD_MIN_LENGTH);

describe('parseOwnerInput', () => {
  it('normalises the email and defaults the display name to its local part', () => {
    expect(
      parseOwnerInput({ email: '  Me@Example.COM ', password: VALID_PASSWORD }),
    ).toEqual({
      email: 'me@example.com',
      displayName: 'me',
      password: VALID_PASSWORD,
    });
  });

  it('keeps a given display name (trimmed)', () => {
    expect(
      parseOwnerInput({
        email: 'me@example.com',
        displayName: ' Hung ',
        password: VALID_PASSWORD,
      }).displayName,
    ).toBe('Hung');
  });

  it('accepts a 100-character display name and rejects 101', () => {
    const input = { email: 'me@example.com', password: VALID_PASSWORD };
    expect(
      parseOwnerInput({ ...input, displayName: 'n'.repeat(100) }).displayName,
    ).toHaveLength(100);
    expect(() =>
      parseOwnerInput({ ...input, displayName: 'n'.repeat(101) }),
    ).toThrow(OwnerBootstrapError);
  });

  it.each([
    ['a bad email', { email: 'not-an-email', password: VALID_PASSWORD }],
    [
      'a short password',
      {
        email: 'me@example.com',
        password: 'p'.repeat(PASSWORD_MIN_LENGTH - 1),
      },
    ],
    [
      'a too long password',
      {
        email: 'me@example.com',
        password: 'p'.repeat(PASSWORD_MAX_LENGTH + 1),
      },
    ],
  ])('rejects %s without echoing the password', (_label, input) => {
    let caught: unknown;
    try {
      parseOwnerInput(input);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(OwnerBootstrapError);
    expect((caught as OwnerBootstrapError).code).toBe(
      OWNER_BOOTSTRAP_ERRORS.INVALID_INPUT,
    );
    expect((caught as Error).message).not.toContain(input.password);
  });
});
