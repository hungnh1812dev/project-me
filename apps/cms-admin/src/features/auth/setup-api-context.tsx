import { createContext, type ReactNode, use } from 'react';

import type { SetupApi } from './setup.api';

const SetupApiContext = createContext<SetupApi | null>(null);

export function SetupApiProvider({
  api,
  children,
}: {
  api: SetupApi;
  children: ReactNode;
}) {
  return <SetupApiContext value={api}>{children}</SetupApiContext>;
}

export function useSetupApi(): SetupApi {
  const api = use(SetupApiContext);
  if (api === null) {
    throw new Error('useSetupApi must be used inside <SetupApiProvider>.');
  }
  return api;
}
