import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';

import { SessionProvider } from '../features/auth/session-context';
import type { AppServices } from './AppServices.setup';

export function AppProviders({
  services,
  children,
}: {
  services: Pick<
    AppServices,
    'store' | 'session' | 'apiProviders' | 'queryClient'
  >;
  children: ReactNode;
}) {
  const featureApis = services.apiProviders.reduceRight(
    (inner, provideApi) => provideApi(inner),
    children,
  );
  return (
    <Provider store={services.store}>
      <QueryClientProvider client={services.queryClient}>
        <SessionProvider session={services.session}>
          {featureApis}
        </SessionProvider>
      </QueryClientProvider>
    </Provider>
  );
}
