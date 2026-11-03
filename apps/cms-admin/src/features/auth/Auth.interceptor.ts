import { BEARER_PREFIX, HTTP_STATUS } from '@configs/Http.constants';
import { isAxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';

declare module 'axios' {
  interface AxiosRequestConfig {
    /**
     * Auth endpoints (login, refresh, logout): no Bearer header, and a 401 is
     * returned as is, never refreshed and retried.
     */
    shouldSkipAuthRefresh?: boolean;
    /**
     * Long calls (uploads): when the access token expires within
     * ACCESS_TOKEN_REFRESH_MARGIN_MS, or its expiry is unreadable, refresh
     * before sending so it cannot expire while the request is in flight.
     */
    shouldRefreshExpiringToken?: boolean;
  }
}

const AUTHORIZATION_HEADER = 'Authorization';

/** A flagged request refreshes when its token expires within this margin. */
const ACCESS_TOKEN_REFRESH_MARGIN_MS = 60 * 1000;
const MS_PER_SECOND = 1000;

/** Expiry of a JWT in epoch ms, or null when the payload cannot be read. */
function readTokenExpiryMs(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    if (payload === undefined) return null;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const claims: unknown = JSON.parse(atob(base64));
    const exp = (claims as { exp?: unknown } | null)?.exp;
    return typeof exp === 'number' ? exp * MS_PER_SECOND : null;
  } catch {
    return null;
  }
}

function isExpiringSoon(token: string): boolean {
  const expiryMs = readTokenExpiryMs(token);
  return expiryMs === null || expiryMs - Date.now() < ACCESS_TOKEN_REFRESH_MARGIN_MS;
}

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
  const requestId = client.interceptors.request.use(async (config) => {
    const authConfig = config as AuthRequestConfig;
    if (authConfig.shouldSkipAuthRefresh === true) return authConfig;
    let token = options.getAccessToken();
    if (authConfig.shouldRefreshExpiringToken === true && token !== null && isExpiringSoon(token)) {
      try {
        token = await options.refreshAccessToken();
      } catch (error) {
        options.onSessionExpired();
        throw error;
      }
    }
    authConfig.authToken = token;
    if (token !== null) {
      authConfig.headers.set(AUTHORIZATION_HEADER, `${BEARER_PREFIX}${token}`);
    }
    return authConfig;
  });

  const responseId = client.interceptors.response.use(undefined, async (error: unknown) => {
    if (!isAxiosError(error) || error.response?.status !== HTTP_STATUS.UNAUTHORIZED) {
      throw error;
    }
    const config = error.config as AuthRequestConfig | undefined;
    if (config === undefined || config.shouldSkipAuthRefresh === true) throw error;
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
  });

  return () => {
    client.interceptors.request.eject(requestId);
    client.interceptors.response.eject(responseId);
  };
}
