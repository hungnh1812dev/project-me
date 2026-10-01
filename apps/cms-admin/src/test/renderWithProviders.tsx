import type { ReactElement, ReactNode } from 'react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { render, renderHook, type RenderOptions } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import {
  createMemoryRouter,
  MemoryRouter,
  RouterProvider,
  type RouteObject,
} from 'react-router-dom';

import { makeQueryClient } from '@/app/queryClient';
import { makeStore, type AppStore } from '@/app/store';
import type { AuthState } from '@/features/auth/types';

export interface ProviderOptions {
  /** Merged over the initial auth state of the fresh store. */
  auth?: Partial<AuthState>;
  /** Initial memory-router location. Defaults to `/`. */
  route?: string;
  store?: AppStore;
  queryClient?: QueryClient;
}

/** A fresh store, `QueryClient` and memory router per call. Session bootstrap is not run. */
export function createProviders({ auth, route = '/', store, queryClient }: ProviderOptions = {}) {
  const client = queryClient ?? makeQueryClient();
  const appStore = store ?? makeStore({ queryClient: client, preloadedAuth: auth });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={appStore}>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
      </QueryClientProvider>
    </Provider>
  );
  return { store: appStore, queryClient: client, Wrapper };
}

export function renderWithProviders(
  ui: ReactElement,
  options: ProviderOptions & Omit<RenderOptions, 'wrapper'> = {},
) {
  const { auth, route, store, queryClient, ...renderOptions } = options;
  const providers = createProviders({ auth, route, store, queryClient });
  return {
    ...providers,
    user: userEvent.setup(),
    ...render(ui, { wrapper: providers.Wrapper, ...renderOptions }),
  };
}

export function renderHookWithProviders<Result>(hook: () => Result, options: ProviderOptions = {}) {
  const providers = createProviders(options);
  return { ...providers, ...renderHook(hook, { wrapper: providers.Wrapper }) };
}

/**
 * Renders a route table in a memory data router (fresh store and `QueryClient`), starting at
 * `route`. Use it for guards and pages that redirect. Session bootstrap is not run.
 */
export function renderRoutes(
  routes: RouteObject[],
  { auth, route = '/', store, queryClient }: ProviderOptions = {},
) {
  const client = queryClient ?? makeQueryClient();
  const appStore = store ?? makeStore({ queryClient: client, preloadedAuth: auth });
  const router = createMemoryRouter(routes, { initialEntries: [route] });
  return {
    store: appStore,
    queryClient: client,
    router,
    user: userEvent.setup(),
    ...render(
      <Provider store={appStore}>
        <QueryClientProvider client={client}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </Provider>,
    ),
  };
}
