import { createContext, type ReactNode, use } from 'react';

export interface ApiProviderProps<Api> {
  api: Api;
  children: ReactNode;
}

/**
 * One React context per feature API. `name` ("Access") shapes the error a hook
 * throws outside its provider, so a missing provider names itself.
 */
export function createApiContext<Api>(name: string) {
  const ApiContext = createContext<Api | null>(null);

  function ApiProvider({ api, children }: ApiProviderProps<Api>) {
    return <ApiContext value={api}>{children}</ApiContext>;
  }

  function useApi(): Api {
    const api = use(ApiContext);
    if (api === null) {
      throw new Error(
        `use${name}Api must be used inside <${name}ApiProvider>.`,
      );
    }
    return api;
  }

  return [ApiProvider, useApi] as const;
}
