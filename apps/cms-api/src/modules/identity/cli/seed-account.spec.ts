import { OWNER_ROLE_SLUG, REVIEWER_ROLE_SLUG } from '../../access';
import { CliInputError } from './password-input';
import {
  assertSeedAllowed,
  parseSeedArgs,
  SeedAccountError,
} from './seed-account';

const BASE_ARGS = ['--email', 'a@example.com', '--password-stdin'];

describe('assertSeedAllowed', () => {
  it('passes outside production', () => {
    expect(() => assertSeedAllowed({ NODE_ENV: 'test' })).not.toThrow();
  });

  it('passes in production with the exact opt-in', () => {
    expect(() =>
      assertSeedAllowed({
        NODE_ENV: 'production',
        ALLOW_ACCOUNT_SEED: 'smoke',
      }),
    ).not.toThrow();
  });

  it.each([undefined, '', '1', 'true', 'Smoke', 'smoke '])(
    'refuses production with opt-in %j',
    (value) => {
      expect(() =>
        assertSeedAllowed({
          NODE_ENV: 'production',
          ALLOW_ACCOUNT_SEED: value,
        }),
      ).toThrow(SeedAccountError);
    },
  );
});

describe('parseSeedArgs', () => {
  it('reads email, role and the 2FA flag', () => {
    expect(
      parseSeedArgs([...BASE_ARGS, '--role', 'guest', '--email-2fa']),
    ).toEqual({
      email: 'a@example.com',
      roleSlug: 'guest',
      isEmail2faEnabled: true,
    });
    expect(parseSeedArgs([...BASE_ARGS, '--role=admin'])).toMatchObject({
      roleSlug: 'admin',
      isEmail2faEnabled: false,
    });
  });

  it.each([OWNER_ROLE_SLUG, REVIEWER_ROLE_SLUG, 'editor', 'custom-role', ''])(
    'refuses role %j',
    (role) => {
      expect(() => parseSeedArgs([...BASE_ARGS, '--role', role])).toThrow(
        SeedAccountError,
      );
    },
  );

  it.each([
    ['no email', ['--role', 'guest', '--password-stdin']],
    ['no role', BASE_ARGS],
    ['no password flag', ['--email', 'a@example.com', '--role', 'guest']],
    ['a password value', [...BASE_ARGS, '--role', 'guest', '--password', 'x']],
    ['a stray value', [...BASE_ARGS, '--role', 'guest', 'extra']],
  ])('refuses %s', (_label, argv) => {
    expect(() => parseSeedArgs(argv)).toThrow(CliInputError);
  });
});
