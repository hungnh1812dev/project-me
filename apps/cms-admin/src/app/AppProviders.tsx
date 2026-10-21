import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';

import { AccessApiProvider } from '../features/access/access-api-context';
import { PasswordApiProvider } from '../features/auth/password-api-context';
import { SessionProvider } from '../features/auth/session-context';
import { SecurityApiProvider } from '../features/security/security-api-context';
import type { AppServices } from './app-services';

export function AppProviders({
  services,
  children,
}: {
  services: Pick<
    AppServices,
    | 'store'
    | 'session'
    | 'passwordApi'
    | 'securityApi'
    | 'accessApi'
    | 'queryClient'
  >;
  children: ReactNode;
}) {
  return (
    <Provider store={services.store}>
      <QueryClientProvider client={services.queryClient}>
        <SessionProvider session={services.session}>
          <PasswordApiProvider api={services.passwordApi}>
            <SecurityApiProvider api={services.securityApi}>
              <AccessApiProvider api={services.accessApi}>
                {children}
              </AccessApiProvider>
            </SecurityApiProvider>
          </PasswordApiProvider>
        </SessionProvider>
      </QueryClientProvider>
    </Provider>
  );
}
