/** Name of the refresh cookie set by cms-api (SPEC §6). */
export const REFRESH_COOKIE_NAME = '__Secure-abyss_rt';

/** Path the refresh cookie is scoped to, relative to the API base URL. */
export const AUTH_REFRESH_PATH = '/auth/refresh';

/** Retries on CI only, where the stack may be slower to warm up. */
export const CI_RETRIES = 1;

/** Per-assertion timeout; the smoke stack runs production builds locally. */
export const EXPECT_TIMEOUT_MS = 10_000;
