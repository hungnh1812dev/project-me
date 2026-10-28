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

import { apiClient } from '../../lib/Api.client';
import {
  type AuthApi,
  createAuthApi,
  isPrivileged,
  PrivilegedAccessError,
  type CurrentUser,
  type LoginCredentials,
  type LoginOutcome,
  type TwoFactorVerification,
} from './Auth.api';

/** `unknown` until the one silent refresh on mount settles. */
export type SessionStatus = 'unknown' | 'anonymous' | 'authenticated';

/**
 * `account` = a reader account signed in (refresh cookie, silent refresh).
 * `reviewer` = a reviewer session: access token only, no cookie, gone
 * on reload.
 */
export type SessionKind = 'account' | 'reviewer';

export interface WebSession {
  status: SessionStatus;
  user: CurrentUser | null;
  /** Null unless `status` is `authenticated`. */
  kind: SessionKind | null;
  /**
   * The access token for Bearer calls from the browser, or null when
   * anonymous. Held in memory only: never in storage, never sent to the
   * Next server (D14).
   */
  getAccessToken: () => string | null;
  signIn: (credentials: LoginCredentials) => Promise<LoginOutcome>;
  completeTwoFactor: (input: TwoFactorVerification) => Promise<void>;
  sendLoginEmailCode: (tempToken: string) => Promise<void>;
  /**
   * Holds a reviewer access token from `POST /reviewer/sessions`. Same
   * holder as the account token: memory only, never sent to the Next server.
   */
  startReviewerSession: (accessToken: string) => Promise<void>;
  /** Ends an account session at the API, or a reviewer session locally. */
  signOut: () => Promise<void>;
}

interface SessionState {
  status: SessionStatus;
  user: CurrentUser | null;
  kind: SessionKind | null;
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
    kind: null,
  });
  const tokenRef = useRef<string | null>(null);
  const refreshedOnMount = useRef(false);

  const clear = useCallback(() => {
    tokenRef.current = null;
    setState({ status: 'anonymous', user: null, kind: null });
  }, []);

  /** Loads the account for a fresh token; on failure the token is dropped. */
  const start = useCallback(
    async (
      accessToken: string,
      kind: SessionKind,
      revokeIfPrivileged = false,
    ) => {
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
        setState({ status: 'authenticated', user, kind });
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
    api
      .refresh()
      .then((accessToken) => start(accessToken, 'account'))
      .catch(clear);
  }, [api, start, clear]);

  const signIn = useCallback(
    async (credentials: LoginCredentials) => {
      const outcome = await api.login(credentials);
      if (outcome.kind === 'signed-in')
        await start(outcome.accessToken, 'account', true);
      return outcome;
    },
    [api, start],
  );

  const completeTwoFactor = useCallback(
    async (input: TwoFactorVerification) => {
      await start(await api.verifyTwoFactor(input), 'account', true);
    },
    [api, start],
  );

  const sendLoginEmailCode = useCallback(
    (tempToken: string) => api.sendLoginEmailCode(tempToken),
    [api],
  );

  const startReviewerSession = useCallback(
    (accessToken: string) => start(accessToken, 'reviewer'),
    [start],
  );

  const signOut = useCallback(async () => {
    // A reviewer session has no refresh family: dropping the token ends it.
    if (state.kind === 'reviewer') {
      clear();
      return;
    }
    // On failure stay signed in and let the caller retry: clearing locally
    // would leave the refresh cookie valid and the next reload signed in.
    await api.logout();
    clear();
  }, [api, clear, state.kind]);

  const value = useMemo<WebSession>(
    () => ({
      ...state,
      getAccessToken: () => tokenRef.current,
      signIn,
      completeTwoFactor,
      sendLoginEmailCode,
      startReviewerSession,
      signOut,
    }),
    [
      state,
      signIn,
      completeTwoFactor,
      sendLoginEmailCode,
      startReviewerSession,
      signOut,
    ],
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
