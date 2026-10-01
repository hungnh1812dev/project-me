import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { Provider } from 'react-redux';

import { useSessionBootstrap } from '@/features/auth/hooks/useSessionBootstrap';

import { queryClient as sharedQueryClient } from './queryClient';
import { store as appStore, type AppStore } from './store';

interface AppProviderProps {
  children: React.ReactNode;
  /** Defaults to the app store. */
  store?: AppStore;
  /** Defaults to the shared `queryClient`. */
  queryClient?: QueryClient;
}

const SessionBootstrap: React.FC = () => {
  useSessionBootstrap();
  return null;
};
SessionBootstrap.displayName = 'SessionBootstrap';

/** Redux store + React Query client, and the one-time session bootstrap. */
const AppProvider: React.FC<AppProviderProps> = ({
  children,
  store = appStore,
  queryClient = sharedQueryClient,
}) => {
  return (
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <SessionBootstrap />
        {children}
      </QueryClientProvider>
    </Provider>
  );
};
AppProvider.displayName = 'AppProvider';

export default AppProvider;
