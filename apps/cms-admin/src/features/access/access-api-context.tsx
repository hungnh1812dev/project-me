import { createContext, type ReactNode, use } from 'react';

import type { AccessApi } from './access.api';

const AccessApiContext = createContext<AccessApi | null>(null);

export function AccessApiProvider({
  api,
  children,
}: {
  api: AccessApi;
  children: ReactNode;
}) {
  return <AccessApiContext value={api}>{children}</AccessApiContext>;
}

export function useAccessApi(): AccessApi {
  const api = use(AccessApiContext);
  if (api === null) {
    throw new Error('useAccessApi must be used inside <AccessApiProvider>.');
  }
  return api;
}
