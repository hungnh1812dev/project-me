import type { CookieOptions } from 'express';

import { API_PREFIX } from '../../../common/constants/api.constants';
import { AUTH_ROUTES } from '../identity.routes';

/** SPEC §6 / D14: refresh cookie. Host-only: never set a Domain attribute. */
export const REFRESH_COOKIE = {
  NAME: '__Secure-abyss_rt',
  PATH: `/${API_PREFIX}/${AUTH_ROUTES.ROOT}`,
  HTTP_ONLY: true,
  SECURE: true,
  SAME_SITE: 'strict',
} as const;

/** SPEC §6 attributes. No `domain`: the cookie must stay host-only. */
export const REFRESH_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: REFRESH_COOKIE.HTTP_ONLY,
  secure: REFRESH_COOKIE.SECURE,
  sameSite: REFRESH_COOKIE.SAME_SITE,
  path: REFRESH_COOKIE.PATH,
};

/** Request header checked by the refresh/logout Origin allowlist (D14). */
export const ORIGIN_HEADER = 'origin';

/** Passport strategy name of the Bearer access-token strategy. */
export const JWT_STRATEGY_NAME = 'jwt';
