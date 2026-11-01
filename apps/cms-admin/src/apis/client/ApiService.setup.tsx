import type { ComponentType, ReactNode } from 'react';
import type { AxiosInstance } from 'axios';

import type { ApiProviderProps } from './ApiContext.setup';

/** Wraps `children` in one feature API's provider, with the API already built. */
export type ApiProviderWrapper = (children: ReactNode) => ReactNode;

/** One feature API: how to build it from the HTTP client and where to provide it. */
export interface ApiService {
  provideFor(client: AxiosInstance): ApiProviderWrapper;
}

/** Pairs an API factory with the provider of its context, hiding the API type. */
export function defineApiService<Api>(
  createApi: (client: AxiosInstance) => Api,
  Provider: ComponentType<ApiProviderProps<Api>>,
): ApiService {
  return {
    provideFor(client) {
      const api = createApi(client);
      return (children) => <Provider api={api}>{children}</Provider>;
    },
  };
}
