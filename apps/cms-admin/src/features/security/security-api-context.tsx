import { createContext, type ReactNode, use } from 'react';

import type { SecurityApi } from './security.api';

const SecurityApiContext = createContext<SecurityApi | null>(null);

export function SecurityApiProvider({
  api,
  children,
}: {
  api: SecurityApi;
  children: ReactNode;
}) {
  return <SecurityApiContext value={api}>{children}</SecurityApiContext>;
}

export function useSecurityApi(): SecurityApi {
  const api = use(SecurityApiContext);
  if (api === null) {
    throw new Error(
      'useSecurityApi must be used inside <SecurityApiProvider>.',
    );
  }
  return api;
}
