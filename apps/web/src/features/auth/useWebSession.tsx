'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { apiClient } from '../../lib/api-client';
import {
  type AuthApi,
  createAuthApi,
  isPrivileged,
  PrivilegedAccessError,
  type CurrentUser,
  type LoginCredentials,
  type LoginOutcome,
  type TwoFactorVerification,
} from './auth.api';

/** `unknown` until the one silent refresh on mount settles. */
export type SessionStatus = 'unknown' | 'anonymous' | 'authenticated';

export interface WebSession {
  status: SessionStatus;
  user: CurrentUser | null;
  /**
   * The access token for Bearer calls from the browser, or null when
   * anonymous. Held in memory only: never in storage, never sent to the
   * Next server (D14).
   */
  getAccessToken: () => string | null;
  signIn: (credentials: LoginCredentials) => Promise<LoginOutcome>;
  completeTwoFactor: (input: TwoFactorVerification) => Promise<void>;
  sendLoginEmailCode: (tempToken: string) => Promise<void>;
  signOut: () => Promise<void>;
}

interface SessionState {
  status: SessionStatus;
  user: CurrentUser | null;
}

const WebSessionContext = createContext<WebSession | null>(null);

const defaultAuthApi = createAuthApi(apiClient);

export function WebSessionProvider({
  children,
  api = defaultAuthApi,
}: {
  children: ReactNode;
  /** Replaced in tests. */
  api?: AuthApi;
}) {
  const [state, setState] = useState<SessionState>({
    status: 'unknown',
    user: null,
  });
  const tokenRef = useRef<string | null>(null);
  const refreshedOnMount = useRef(false);

  const clear = useCallback(() => {
    tokenRef.current = null;
    setState({ status: 'anonymous', user: null });
  }, []);

  /** Loads the account for a fresh token; on failure the token is dropped. */
  const start = useCallback(
    async (accessToken: string, revokeIfPrivileged = false) => {
      try {
        const user = await api.me(accessToken);
        // Reader roles only: a privileged token is dropped, never held.
        if (isPrivileged(user)) {
          // A sign-in just started this refresh family: revoke it so no
          // admin session stays live in this browser. Best effort. Not done
          // on the silent refresh, whose cookie belongs to the admin console.
          if (revokeIfPrivileged) await api.logout().catch(() => undefined);
          throw new PrivilegedAccessError();
        }
        tokenRef.current = accessToken;
        setState({ status: 'authenticated', user });
      } catch (cause) {
        clear();
        throw cause;
      }
    },
    [api, clear],
  );

  // One silent refresh per page load. The ref keeps the StrictMode effect
  // replay from spending the rotating refresh token twice.
  useEffect(() => {
    if (refreshedOnMount.current) return;
    refreshedOnMount.current = true;
    api.refresh().then(start).catch(clear);
  }, [api, start, clear]);

  const signIn = useCallback(
    async (credentials: LoginCredentials) => {
      const outcome = await api.login(credentials);
      if (outcome.kind === 'signed-in') await start(outcome.accessToken, true);
      return outcome;
    },
    [api, start],
  );

  const completeTwoFactor = useCallback(
    async (input: TwoFactorVerification) => {
      await start(await api.verifyTwoFactor(input), true);
    },
    [api, start],
  );

  const sendLoginEmailCode = useCallback(
    (tempToken: string) => api.sendLoginEmailCode(tempToken),
    [api],
  );

  const signOut = useCallback(async () => {
    // On failure stay signed in and let the caller retry: clearing locally
    // would leave the refresh cookie valid and the next reload signed in.
    await api.logout();
    clear();
  }, [api, clear]);

  const value = useMemo<WebSession>(
    () => ({
      ...state,
      getAccessToken: () => tokenRef.current,
      signIn,
      completeTwoFactor,
      sendLoginEmailCode,
      signOut,
    }),
    [state, signIn, completeTwoFactor, sendLoginEmailCode, signOut],
  );

  return (
    <WebSessionContext.Provider value={value}>
      {children}
    </WebSessionContext.Provider>
  );
}

export function useWebSession(): WebSession {
  const session = useContext(WebSessionContext);
  if (session === null) {
    throw new Error('useWebSession must be used inside <WebSessionProvider>.');
  }
  return session;
}
