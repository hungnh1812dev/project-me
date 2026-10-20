import { createContext, type ReactNode, use } from 'react';

import type { PasswordApi } from './password.api';

const PasswordApiContext = createContext<PasswordApi | null>(null);

export function PasswordApiProvider({
  api,
  children,
}: {
  api: PasswordApi;
  children: ReactNode;
}) {
  return <PasswordApiContext value={api}>{children}</PasswordApiContext>;
}

export function usePasswordApi(): PasswordApi {
  const api = use(PasswordApiContext);
  if (api === null) {
    throw new Error(
      'usePasswordApi must be used inside <PasswordApiProvider>.',
    );
  }
  return api;
}
