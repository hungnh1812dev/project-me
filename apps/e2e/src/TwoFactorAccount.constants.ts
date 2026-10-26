import { e2eEnv } from './E2e.env';

/**
 * Password of the 2FA account after `TwoFactor.e2e.spec.ts` ran (it ends with
 * email codes on and this password). Only that spec uses it.
 */
export const TWO_FACTOR_CHANGED_PASSWORD = `${e2eEnv.twoFactorPassword.slice(0, 100)}-changed`;
