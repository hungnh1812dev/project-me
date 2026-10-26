import { CliInputError } from './PasswordInput.client';
import { readOwnerEnv } from './IdentityCli.setup';

describe('readOwnerEnv', () => {
  it('reads the email and display name', () => {
    expect(
      readOwnerEnv({ OWNER_EMAIL: 'a@b.test', OWNER_DISPLAY_NAME: 'Ada' }),
    ).toEqual({ email: 'a@b.test', displayName: 'Ada' });
  });

  it('treats a blank display name as unset', () => {
    expect(
      readOwnerEnv({ OWNER_EMAIL: 'a@b.test', OWNER_DISPLAY_NAME: '  ' })
        .displayName,
    ).toBeUndefined();
  });

  it.each([undefined, '', '   '])('rejects a missing email (%j)', (email) => {
    expect(() => readOwnerEnv({ OWNER_EMAIL: email })).toThrow(CliInputError);
  });

  it('ignores unrelated keys and never reads a password key', () => {
    const result = readOwnerEnv({
      OWNER_EMAIL: 'a@b.test',
      OWNER_PASSWORD: 'secret',
    });
    expect(Object.keys(result).sort()).toEqual(['displayName', 'email']);
    expect(JSON.stringify(result)).not.toContain('secret');
  });
});
