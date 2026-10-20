import { createContext, type ReactNode, use } from 'react';

import type { Session } from './session';

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({
  session,
  children,
}: {
  session: Session;
  children: ReactNode;
}) {
  return <SessionContext value={session}>{children}</SessionContext>;
}

export function useSession(): Session {
  const session = use(SessionContext);
  if (session === null) {
    throw new Error('useSession must be used inside <SessionProvider>.');
  }
  return session;
}
