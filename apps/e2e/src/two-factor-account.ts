import { e2eEnv } from './env';

/**
 * Password of the 2FA account after `two-factor.spec.ts` ran (it ends with
 * email codes on and this password). `web-session.spec.ts` runs after it.
 */
export const TWO_FACTOR_CHANGED_PASSWORD = `${e2eEnv.twoFactorPassword.slice(0, 100)}-changed`;
