'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { clientApi } from '@/apis/client/Api.client';

import {
  createAuthApi,
  type AuthApi,
  type CurrentUser,
  type HumanCheckInput,
  type LoginCredentials,
  type LoginOutcome,
  type TwoFactorVerification,
} from './Auth.api';
import { isVisibleTo } from './RoleDisplay.rules';

/** `unknown` until the session read on mount settles. */
export type SessionStatus = 'unknown' | 'anonymous' | 'authenticated';

export interface WebSession {
  status: SessionStatus;
  user: CurrentUser | null;
  signIn: (credentials: LoginCredentials) => Promise<LoginOutcome>;
  completeTwoFactor: (input: TwoFactorVerification) => Promise<void>;
  sendLoginEmailCode: (input?: HumanCheckInput) => Promise<void>;
  signOut: () => Promise<void>;
}

interface SessionState {
  status: SessionStatus;
  user: CurrentUser | null;
}

const WebSessionContext = createContext<WebSession | null>(null);

const defaultAuthApi = createAuthApi(clientApi);

const ANONYMOUS_STATE: SessionState = { status: 'anonymous', user: null };

export function WebSessionProvider({
  children,
  api = defaultAuthApi,
}: {
  children: ReactNode;
  /** Replaced in tests. */
  api?: AuthApi;
}) {
  const [state, setState] = useState<SessionState>({ status: 'unknown', user: null });
  const hasReadOnMount = useRef(false);

  const startFor = useCallback(
    (user: CurrentUser) => setState({ status: 'authenticated', user }),
    [],
  );

  // One session read per page load. The ref keeps the StrictMode effect replay
  // from reading twice.
  useEffect(() => {
    if (hasReadOnMount.current) return;
    hasReadOnMount.current = true;
    api
      .readSession()
      .then((user) => setState(user === null ? ANONYMOUS_STATE : { status: 'authenticated', user }))
      .catch(() => setState(ANONYMOUS_STATE));
  }, [api]);

  const signIn = useCallback(
    async (credentials: LoginCredentials) => {
      const outcome = await api.login(credentials);
      if (outcome.kind === 'signed-in') startFor(outcome.user);
      return outcome;
    },
    [api, startFor],
  );

  const completeTwoFactor = useCallback(
    async (input: TwoFactorVerification) => startFor(await api.verifyTwoFactor(input)),
    [api, startFor],
  );

  const sendLoginEmailCode = useCallback(
    (input?: HumanCheckInput) => api.sendLoginEmailCode(input),
    [api],
  );

  const signOut = useCallback(async () => {
    // On failure stay signed in and let the caller retry: the BFF clears the
    // cookie only when it answers.
    await api.logout();
    setState(ANONYMOUS_STATE);
  }, [api]);

  const value = useMemo<WebSession>(
    () => ({ ...state, signIn, completeTwoFactor, sendLoginEmailCode, signOut }),
    [state, signIn, completeTwoFactor, sendLoginEmailCode, signOut],
  );

  return <WebSessionContext.Provider value={value}>{children}</WebSessionContext.Provider>;
}

export function useWebSession(): WebSession {
  const session = useContext(WebSessionContext);
  if (session === null) {
    throw new Error('useWebSession must be used inside <WebSessionProvider>.');
  }
  return session;
}

/** Display only (D3): whether the viewer may see something that declares `requiresRole`. */
export function useCanSee(requiresRole: string | null | undefined): boolean {
  const { status, user } = useWebSession();
  return isVisibleTo(requiresRole, { status, user });
}
