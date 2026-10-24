import {
  type AxiosInstance,
  type InternalAxiosRequestConfig,
  isAxiosError,
} from 'axios';

import { BEARER_PREFIX, HTTP_STATUS } from '../../config/http.constants';

declare module 'axios' {
  interface AxiosRequestConfig {
    /**
     * Auth endpoints (login, refresh, logout): no Bearer header, and a 401 is
     * returned as is, never refreshed and retried.
     */
    shouldSkipAuthRefresh?: boolean;
  }
}

const AUTHORIZATION_HEADER = 'Authorization';

interface AuthRequestConfig extends InternalAxiosRequestConfig {
  /** Access token this attempt was sent with. */
  authToken?: string | null;
  /** Set on the one retry after a refresh, so a request never loops. */
  wasAuthRetried?: boolean;
}

export interface AuthInterceptorOptions {
  /** Current in-memory access token, if any. */
  getAccessToken(): string | null;
  /** Single-flight refresh: concurrent callers share one request. */
  refreshAccessToken(): Promise<string>;
  /** The session is gone (refresh refused, or a fresh token still got 401). */
  onSessionExpired(): void;
}

/**
 * Sends the access token as a Bearer header (D14) and, on a 401 from a
 * protected call, refreshes once and retries that call once. Concurrent 401s
 * wait for the same refresh. A call that failed with an older token is
 * retried with the current one without another refresh. Returns a function
 * that removes both interceptors.
 */
export function installAuthInterceptor(
  client: AxiosInstance,
  options: AuthInterceptorOptions,
): () => void {
  const requestId = client.interceptors.request.use((config) => {
    const authConfig = config as AuthRequestConfig;
    if (authConfig.shouldSkipAuthRefresh === true) return authConfig;
    const token = options.getAccessToken();
    authConfig.authToken = token;
    if (token !== null) {
      authConfig.headers.set(AUTHORIZATION_HEADER, `${BEARER_PREFIX}${token}`);
    }
    return authConfig;
  });

  const responseId = client.interceptors.response.use(
    undefined,
    async (error: unknown) => {
      if (
        !isAxiosError(error) ||
        error.response?.status !== HTTP_STATUS.UNAUTHORIZED
      ) {
        throw error;
      }
      const config = error.config as AuthRequestConfig | undefined;
      if (config === undefined || config.shouldSkipAuthRefresh === true)
        throw error;
      if (config.wasAuthRetried === true) {
        options.onSessionExpired();
        throw error;
      }

      const current = options.getAccessToken();
      if (current === null || current === config.authToken) {
        try {
          await options.refreshAccessToken();
        } catch {
          options.onSessionExpired();
          throw error;
        }
      }
      config.wasAuthRetried = true;
      return client.request(config);
    },
  );

  return () => {
    client.interceptors.request.eject(requestId);
    client.interceptors.response.eject(responseId);
  };
}
