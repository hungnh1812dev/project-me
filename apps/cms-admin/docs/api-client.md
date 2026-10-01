# API client

One axios instance, `cmsApi`, carries every HTTP call the admin makes. It adds the in-memory access token as a bearer, recovers from 401s with a single-flight token refresh, and normalizes every failure to one `ApiError` shape.

Source: `src/core/api/CmsApi.ts`, `src/core/api/apiError.ts`.

## Contract

| Export                      | From          | What it is                                                                                              |
| --------------------------- | ------------- | ------------------------------------------------------------------------------------------------------- |
| `cmsApi`                    | `CmsApi.ts`   | The axios instance: `baseURL = API_BASE_URL`, `withCredentials: true`, JSON `Content-Type` and `Accept` |
| `configureCmsApi(handlers)` | `CmsApi.ts`   | Wires the session owner in once at startup (see below)                                                  |
| `refreshAccessToken()`      | `CmsApi.ts`   | Single-flight `POST /auth/refresh`; resolves with the rotated token                                     |
| `CmsApiHandlers`            | `CmsApi.ts`   | `{ getAccessToken, onTokenRefreshed, onSessionExpired }`                                                |
| `ApiError`                  | `apiError.ts` | `Error` subclass: `{ status, message, messages, code?, body? }`                                         |
| `toApiError(e)`             | `apiError.ts` | Normalizes anything thrown into an `ApiError` (returns an `ApiError` unchanged)                         |
| `isApiError(e)`             | `apiError.ts` | Type guard (`instanceof ApiError`)                                                                      |

`API_BASE_URL` comes from `VITE_API_URL` (see [Testing and config](./testing-and-config.md#env-vars)). The module is React- and store-agnostic: it never imports the store. The store calls `configureCmsApi` once (small phase 1.3):

```ts
configureCmsApi({
  getAccessToken: () => store.getState().auth.accessToken,
  onTokenRefreshed: (token) => store.dispatch(tokenRefreshed(token)),
  onSessionExpired: () => store.dispatch(sessionExpired()),
});
```

Until then the handlers are no-ops (no token, nothing stored).

### Request config flags

`AxiosRequestConfig` is augmented with two typed flags:

- `skipAuthRefresh?: boolean`: a 401 on this request never triggers a refresh. Use it for the session bootstrap and the auth endpoints.
- `_retry?: boolean`: internal. It marks the single retry after a refresh, so a request is retried at most once.

## Bearer interceptor

Each request gets `Authorization: Bearer <token>` when `getAccessToken()` returns a token, and no `Authorization` header otherwise. The token lives in the Redux store only (memory), never in web storage.

## 401 refresh sequence

On a 401 from any endpoint except `/auth/login`, `/auth/refresh` and `/auth/logout` (matched by path), and except requests with `skipAuthRefresh`:

1. If the token was already rotated while the request was in flight (the current token differs from the one sent), the request is retried at once with the current token. No refresh goes out.
2. Otherwise the request joins the shared recovery: one `POST /auth/refresh` (the refresh token is the httpOnly cookie, so the body is empty). Concurrent 401s wait on the same promise, so exactly one refresh goes out. This matters because the backend blacklists a consumed refresh token: a second refresh would end the session.
3. On success, `onTokenRefreshed(accessToken)` stores the rotated token, and each waiting request is retried once with `Bearer <new token>`. The caller receives the retry's result.
4. If the refresh fails (401, network error, anything), `onSessionExpired()` runs once, and every waiting caller rejects with the original `ApiError` (status 401).
5. If a retry gets 401 again, `onSessionExpired()` runs once for that token and the caller rejects with the 401 `ApiError`. No second refresh happens.

Expiry is deduplicated by token: a burst of 401s carrying the same token, including late ones that arrive after the session already expired, reports the expiry only once. `configureCmsApi` resets this latch.

`refreshAccessToken()` is the same single-flight function. Session bootstrap (small phase 1.3) calls it directly. It rejects with an `ApiError` and never calls `onSessionExpired` itself: the caller decides what a failed refresh means.

## Error shape

Every rejection from `cmsApi` is already an `ApiError`:

```ts
class ApiError extends Error {
  status: number; // HTTP status, or 0 when no response arrived
  message: string; // human-readable, safe to show
  messages: string[]; // every message (validation errors keep one entry each)
  code?: string; // axios error code, for example ERR_BAD_REQUEST, ERR_NETWORK, ECONNABORTED
  body?: unknown; // raw response body
}
```

| Failure                                     | `status` | `message`                                                       |
| ------------------------------------------- | -------- | --------------------------------------------------------------- |
| Nest `{ message: 'text' }`                  | HTTP     | `'text'`                                                        |
| Nest `{ message: ['a', 'b'] }` (validation) | HTTP     | `'a, b'` (`messages` keeps `['a', 'b']`)                        |
| Any other body (HTML, empty, no `message`)  | HTTP     | `Request failed with status <status>`                           |
| Network error (no response)                 | 0        | `Cannot reach the server. Check your connection and try again.` |
| Timeout (`ECONNABORTED`, `ETIMEDOUT`)       | 0        | `The request timed out. Try again.`                             |
| Non-axios `Error` thrown                    | 0        | the error's message                                             |
| Anything else thrown                        | 0        | `Something went wrong.` (`body` holds the thrown value)         |

## How later code must use it

- **Every HTTP call goes through `cmsApi`.** Do not create another axios instance or call `fetch` directly, or the bearer and the refresh are lost.
- **RTK Query (1.3):** `axiosBaseQuery` calls `cmsApi` and maps a rejection with `toApiError(e)`. Auth endpoints (`login`, `logout`, `refresh`) pass `skipAuthRefresh: true`.
- **React Query (Phase 2+):** a query or mutation function calls `cmsApi` and lets the `ApiError` propagate, so `error` is typed as `ApiError`. Narrow `unknown` errors with `isApiError` or `toApiError`. Check `status === 403` to show a forbidden state; 401s have already been handled by the client.

## Testing

- Unit tests: `src/core/api/apiError.test.ts`, `CmsApi.test.ts` (instance, bearer, error mapping) and `CmsApi.refresh.test.ts` (refresh, single-flight, expiry, skip rules). Run them with `pnpm --filter cms-admin exec vitest run src/core/api`.
- They run against the MSW node server. A test wires a fake session with `configureCmsApi` and counts refresh calls in its `/auth/refresh` handler.
- `src/test/msw/handlers.ts` has one default handler: `POST */api/v1/auth/refresh` answers 401 (no session cookie). Override it with `server.use(...)` to model a live session.

## Decisions

- **401 recovery lives in the axios interceptor, not in an RTK Query base query**, so RTK Query and React Query share one refresh path.
- **Token in the store, client stays store-agnostic**, through `configureCmsApi`, which avoids a circular import between the store and the client.
- **`ApiError` is a class**, so `instanceof` works and stack traces survive. RTK Query state should hold a plain copy of its fields (handled in 1.3).
- **`code` is the axios error code**, not Nest's `error` text, so it has one meaning for HTTP and network failures alike.
