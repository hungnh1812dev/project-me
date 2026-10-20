import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';

import { PasswordApiProvider } from '../features/auth/password-api-context';
import { SessionProvider } from '../features/auth/session-context';
import type { AppServices } from './app-services';

export function AppProviders({
  services,
  children,
}: {
  services: Pick<
    AppServices,
    'store' | 'session' | 'passwordApi' | 'queryClient'
  >;
  children: ReactNode;
}) {
  return (
    <Provider store={services.store}>
      <QueryClientProvider client={services.queryClient}>
        <SessionProvider session={services.session}>
          <PasswordApiProvider api={services.passwordApi}>
            {children}
          </PasswordApiProvider>
        </SessionProvider>
      </QueryClientProvider>
    </Provider>
  );
}
