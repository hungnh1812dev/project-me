import type { AxiosInstance } from 'axios';
import type { ComponentType, ReactNode } from 'react';

import type { NavSectionId } from './NavSections.constants';
import type { PermissionAction } from './PermissionAction.constants';
import type { ApiProviderProps } from './ApiContext.setup';

export interface FeatureRoute {
  /** Omit for the index route of the app shell. */
  path?: string;
  Component: ComponentType;
}

/** A nav link, listed under `section`, shown only to callers holding `action` on `subject`. */
export interface FeatureNavItem {
  label: string;
  path: string;
  section: NavSectionId;
  subject: string;
  action: PermissionAction;
}

/** What a data-backed nav hook returns: its items and the load state the menu shows. */
export interface NavItemsState {
  items: readonly FeatureNavItem[];
  isLoading: boolean;
  hasFailed: boolean;
  retry: () => void;
}

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

/** What a feature contributes to the app; `features/registry.ts` lists them. */
export interface Feature {
  routes: readonly FeatureRoute[];
  navItems?: readonly FeatureNavItem[];
  /** Items that depend on loaded data; a hook, so it may call queries. */
  useNavItems?: () => NavItemsState;
  apiServices?: readonly ApiService[];
}
