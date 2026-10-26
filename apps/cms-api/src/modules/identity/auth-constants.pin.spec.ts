import { NO_STORE_HEADER } from '../../common/constants/Http.constants';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  JWT_ALGORITHM,
  REFRESH_TOKEN_BYTES,
  REFRESH_TOKEN_REUSE_GRACE_MS,
  REFRESH_TOKEN_REUSE_GRACE_SECONDS,
  REFRESH_TOKEN_TTL_MS,
  REFRESH_TOKEN_TTL_SECONDS,
  REVIEWER_SESSION_TTL_SECONDS,
  TOKEN_TYPES,
  TWO_FACTOR_TEMP_TOKEN_TTL_SECONDS,
} from './domain/Identity.constants';
import {
  REFRESH_COOKIE,
  REFRESH_COOKIE_OPTIONS,
} from './http/IdentityHttp.constants';

/**
 * Security constants pinned as literals (SPEC D9, D14). If a refactor changes
 * one of these by accident, this spec fails; a deliberate change must update
 * the literal here and the SPEC together.
 */
describe('auth security constants (pinned literals)', () => {
  it('pins the refresh cookie attributes', () => {
    expect(REFRESH_COOKIE).toStrictEqual({
      NAME: '__Secure-abyss_rt',
      PATH: '/api/v1/auth',
      HTTP_ONLY: true,
      SECURE: true,
      SAME_SITE: 'strict',
    });
    expect(Object.keys(REFRESH_COOKIE)).not.toContain('DOMAIN');
  });

  it('pins the only accepted JWT algorithm', () => {
    expect(JWT_ALGORITHM).toBe('HS256');
  });

  it('pins the token type claims', () => {
    expect(TOKEN_TYPES).toStrictEqual({ ACCESS: 'access', TWO_FACTOR: '2fa' });
  });

  it('pins the token lifetimes in seconds', () => {
    expect(ACCESS_TOKEN_TTL_SECONDS).toBe(900);
    expect(REFRESH_TOKEN_TTL_SECONDS).toBe(604_800);
    expect(REFRESH_TOKEN_REUSE_GRACE_SECONDS).toBe(10);
    expect(TWO_FACTOR_TEMP_TOKEN_TTL_SECONDS).toBe(300);
    expect(REVIEWER_SESSION_TTL_SECONDS).toBe(86_400);
  });

  it('pins the derived lifetimes in milliseconds', () => {
    expect(REFRESH_TOKEN_TTL_MS).toBe(604_800_000);
    expect(REFRESH_TOKEN_REUSE_GRACE_MS).toBe(10_000);
  });

  it('maps the refresh cookie to host-only, httpOnly, secure, strict options', () => {
    expect(REFRESH_COOKIE_OPTIONS).toStrictEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/api/v1/auth',
    });
    expect(Object.keys(REFRESH_COOKIE_OPTIONS)).not.toContain('domain');
  });

  it('pins the refresh token entropy', () => {
    expect(REFRESH_TOKEN_BYTES).toBe(32);
  });

  it('pins the no-store header', () => {
    expect(NO_STORE_HEADER).toStrictEqual({
      NAME: 'Cache-Control',
      VALUE: 'no-store',
    });
  });
});
