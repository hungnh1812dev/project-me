import axios, { AxiosHeaders, type AxiosRequestConfig } from 'axios';

import { API_BASE_URL } from '@/core/config/env';

import { toApiError } from './apiError';

declare module 'axios' {
  interface AxiosRequestConfig {
    /** Never try a token refresh when this request gets 401 (auth endpoints, bootstrap calls). */
    skipAuthRefresh?: boolean;
    /** Internal: set on the single retry after a refresh, so a request is retried at most once. */
    _retry?: boolean;
  }
}

/** Hooks into the session owner (the Redux store), so this module stays React- and store-agnostic. */
export interface CmsApiHandlers {
  getAccessToken: () => string | null;
  onTokenRefreshed: (accessToken: string) => void;
  onSessionExpired: () => void;
}

interface RefreshResponse {
  message: string;
  accessToken: string;
}

// The token that was in use when the session last expired, so a burst of 401s for the same
// token reports the expiry only once.
let expiredToken: string | null | undefined;

let handlers: CmsApiHandlers = {
  getAccessToken: () => null,
  onTokenRefreshed: () => {},
  onSessionExpired: () => {},
};

/** Called once at startup (from the store) to wire the token source and session callbacks. */
export function configureCmsApi(next: CmsApiHandlers): void {
  handlers = next;
  expiredToken = undefined;
}

export const cmsApi = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
});

const NO_REFRESH_PATH = /\/auth\/(?:login|refresh|logout)\/?(?:[?#]|$)/;

function skipsRefresh(config: AxiosRequestConfig): boolean {
  return config.skipAuthRefresh === true || NO_REFRESH_PATH.test(config.url ?? '');
}

function bearerOf(config: AxiosRequestConfig): string | null {
  const header = AxiosHeaders.from(config.headers as AxiosHeaders).get('Authorization');
  return typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : null;
}

let refreshPromise: Promise<string> | null = null;

/**
 * Single-flight `POST /auth/refresh`: concurrent callers share one in-flight request. On success
 * it hands the rotated token to `onTokenRefreshed` and resolves with it. It rejects with an
 * `ApiError` and never expires the session itself (the caller decides).
 */
export function refreshAccessToken(): Promise<string> {
  refreshPromise ??= cmsApi
    .post<RefreshResponse>('/auth/refresh', undefined, { skipAuthRefresh: true })
    .then(({ data }) => {
      handlers.onTokenRefreshed(data.accessToken);
      return data.accessToken;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

function expireSessionOnce(token: string | null): void {
  if (token !== null && token === expiredToken) return;
  expiredToken = token;
  handlers.onSessionExpired();
}

let recoveryPromise: Promise<string> | null = null;

/** Refreshes for a 401'd request. Concurrent 401s share one recovery, so expiry fires once. */
function recoverSession(staleToken: string | null): Promise<string> {
  recoveryPromise ??= refreshAccessToken()
    .catch((error: unknown) => {
      expireSessionOnce(staleToken);
      throw error;
    })
    .finally(() => {
      recoveryPromise = null;
    });
  return recoveryPromise;
}

cmsApi.interceptors.request.use((config) => {
  if (config._retry) return config;
  const token = handlers.getAccessToken();
  if (token) config.headers.set('Authorization', `Bearer ${token}`);
  return config;
});

cmsApi.interceptors.response.use(undefined, async (error: unknown) => {
  const apiError = toApiError(error);
  const config = axios.isAxiosError(error) ? error.config : undefined;
  if (apiError.status !== 401 || !config || skipsRefresh(config)) throw apiError;

  const sentToken = bearerOf(config);
  if (config._retry) {
    expireSessionOnce(sentToken);
    throw apiError;
  }
  if (sentToken !== null && sentToken === expiredToken) throw apiError;

  // The token may already have rotated while this request was in flight: retry without refreshing.
  const current = handlers.getAccessToken();
  let token: string;
  if (current && current !== sentToken) {
    token = current;
  } else {
    try {
      token = await recoverSession(sentToken);
    } catch {
      throw apiError;
    }
  }

  config._retry = true;
  config.headers.set('Authorization', `Bearer ${token}`);
  return cmsApi.request(config);
});
