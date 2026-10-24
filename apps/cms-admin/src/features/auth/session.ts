import type { Dispatch } from '@reduxjs/toolkit';

import {
  createCrossTabRefresh,
  type CrossTabRefreshOptions,
} from './cross-tab-refresh';
import { singleFlight } from './single-flight';
import type {
  AuthApi,
  LoginCredentials,
  LoginOutcome,
  TwoFactorVerification,
} from './auth.api';
import { accessTokenReceived, signedIn, signedOut } from './auth.slice';
import type { LoginNotice } from './login-notice';

export interface SessionOptions {
  dispatch: Dispatch;
  authApi: AuthApi;
  /** Called whenever the session ends (sign-out or expiry), e.g. to drop cached server data. */
  onSessionEnded?: () => void;
  /** T11a: Web Locks + BroadcastChannel; omitted = this tab only. */
  crossTab?: CrossTabRefreshOptions;
}

/**
 * Session lifecycle on top of the auth API and `authSlice`. Every refresh,
 * whether from app start or from the 401 interceptor, goes through one
 * single-flight call, and across tabs through `createCrossTabRefresh`
 * (T11a): the refresh cookie rotates on use, so parallel refreshes would
 * look like token reuse and revoke the session.
 */
export function createSession({
  dispatch,
  authApi,
  onSessionEnded,
  crossTab,
}: SessionOptions) {
  const end = (notice?: LoginNotice) => {
    dispatch(signedOut(notice));
    onSessionEnded?.();
  };

  const refreshAcrossTabs =
    crossTab === undefined
      ? () => authApi.refresh()
      : createCrossTabRefresh(() => authApi.refresh(), crossTab);

  const refreshAccessToken = singleFlight(async () => {
    const token = await refreshAcrossTabs();
    dispatch(accessTokenReceived(token));
    return token;
  });

  const loadUser = async () => {
    dispatch(signedIn(await authApi.me()));
  };

  /** Stores a fresh access token, then loads the user; undone if /me fails. */
  const startWith = async (accessToken: string) => {
    dispatch(accessTokenReceived(accessToken));
    try {
      await loadUser();
    } catch (error) {
      dispatch(signedOut());
      throw error;
    }
  };

  return {
    refreshAccessToken,

    /** Silent refresh on app start: signed in if the refresh cookie is valid. */
    restore: async (): Promise<void> => {
      try {
        await refreshAccessToken();
        await loadUser();
      } catch {
        dispatch(signedOut());
      }
    },

    /**
     * Login, then /me. A 2FA answer stores nothing: the caller keeps the temp
     * token in memory for `completeTwoFactor`.
     */
    signIn: async (credentials: LoginCredentials): Promise<LoginOutcome> => {
      const outcome = await authApi.login(credentials);
      if (outcome.kind === 'signed-in') await startWith(outcome.accessToken);
      return outcome;
    },

    /** Second login step (T13): the code for a temp token, then /me. */
    completeTwoFactor: async (input: TwoFactorVerification): Promise<void> => {
      await startWith(await authApi.verifyTwoFactor(input));
    },

    sendLoginEmailCode: (tempToken: string): Promise<void> =>
      authApi.sendLoginEmailCode(tempToken),

    /** Re-reads /me after a settings change (e.g. 2FA turned on). */
    reloadUser: loadUser,

    /** Revokes the refresh token server-side; the local session ends either way. */
    signOut: async (): Promise<void> => {
      try {
        await authApi.logout();
      } catch {
        // Nothing to recover: the user asked to leave, so clear locally.
      } finally {
        end();
      }
    },

    /**
     * The session is gone: the interceptor could not renew it, or the server
     * ended it (e.g. password changed, with a notice for the sign-in page).
     */
    expire: (notice?: LoginNotice): void => {
      end(notice);
    },
  };
}

export type Session = ReturnType<typeof createSession>;
