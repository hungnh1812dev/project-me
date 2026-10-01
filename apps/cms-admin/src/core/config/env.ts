const API_PREFIX = '/api/v1';

/**
 * Builds the API base URL from `VITE_API_URL`. An empty or unset value gives the
 * relative `/api/v1`, which the Vite dev server proxies to the backend.
 */
export function buildApiBaseUrl(apiUrl: string | undefined): string {
  const origin = (apiUrl ?? '').trim().replace(/\/+$/, '');
  return `${origin}${API_PREFIX}`;
}

export const API_BASE_URL = buildApiBaseUrl(import.meta.env.VITE_API_URL);
