import type { Dispatch } from '@reduxjs/toolkit';

import { singleFlight } from '../../lib/single-flight';
import type { AuthApi, LoginCredentials, LoginOutcome } from './auth.api';
import { accessTokenReceived, signedIn, signedOut } from './auth.slice';

export interface SessionOptions {
  dispatch: Dispatch;
  authApi: AuthApi;
  /** Called whenever the session ends (sign-out or expiry), e.g. to drop cached server data. */
  onSessionEnded?: () => void;
}

/**
 * Session lifecycle on top of the auth API and `authSlice`. Every refresh,
 * whether from app start or from the 401 interceptor, goes through one
 * single-flight call: the refresh cookie rotates on use, so two parallel
 * refreshes would look like token reuse and revoke the session.
 */
export function createSession({
  dispatch,
  authApi,
  onSessionEnded,
}: SessionOptions) {
  const end = () => {
    dispatch(signedOut());
    onSessionEnded?.();
  };

  const refreshAccessToken = singleFlight(async () => {
    const token = await authApi.refresh();
    dispatch(accessTokenReceived(token));
    return token;
  });

  const loadUser = async () => {
    dispatch(signedIn(await authApi.me()));
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

    /** Login, then /me. A 2FA answer stores nothing (T13). */
    signIn: async (credentials: LoginCredentials): Promise<LoginOutcome> => {
      const outcome = await authApi.login(credentials);
      if (outcome.kind === 'signed-in') {
        dispatch(accessTokenReceived(outcome.accessToken));
        try {
          await loadUser();
        } catch (error) {
          dispatch(signedOut());
          throw error;
        }
      }
      return outcome;
    },

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

    /** The interceptor could not renew the session. */
    expire: (): void => {
      end();
    },
  };
}

export type Session = ReturnType<typeof createSession>;
