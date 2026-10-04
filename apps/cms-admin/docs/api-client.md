# API client

One axios instance, `cmsApi`, carries every HTTP call the admin makes. It adds the in-memory access
token as a bearer (only to the API origin), recovers from 401s with a single-flight token refresh,
and normalizes every failure to one `ApiError` shape. Every data module builds on it.

## Feature

### Contract

| Export                      | What it is                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------- |
| `cmsApi`                    | The axios instance: `baseURL = API_BASE_URL`, `withCredentials: true`, JSON `Content-Type` and `Accept` |
| `configureCmsApi(handlers)` | Wires the session owner in once at startup                                                              |
| `refreshAccessToken()`      | Single-flight `POST /auth/refresh`; resolves with the rotated token                                     |
| `CmsApiHandlers`            | `{ getAccessToken, onTokenRefreshed, onSessionExpired }`                                                |
| `ApiError`                  | `Error` subclass: `{ status, message, messages, code?, body? }`                                         |
| `toApiError(e)`             | Normalizes anything thrown into an `ApiError` (an `ApiError` passes unchanged)                          |
| `isApiError(e)`             | Type guard (`instanceof ApiError`)                                                                      |
| `axiosBaseQuery`            | RTK Query base query over `cmsApi`; rejections become `{ error: ApiErrorData }` via `toApiErrorData`    |

The module never imports the store. `makeStore()` calls `configureCmsApi` with `getAccessToken`
(reads `state.auth.accessToken`), `onTokenRefreshed` (dispatches `tokenReceived`) and
`onSessionExpired` (dispatches `sessionExpired`); until then the handlers are no-ops.

`AxiosRequestConfig` gains two typed flags: `skipAuthRefresh` (a 401 on this request never
refreshes; used by the bootstrap and the auth endpoints) and the internal `_retry` (a request is
retried at most once).

### Bearer interceptor (SEC-3)

`Authorization: Bearer <token>` is set when a token exists **and** the resolved request URL
(`baseURL` + `url`, relative resolved against `window.location.origin`) has the origin of
`API_BASE_URL`. With the default relative base that is the page origin; with an absolute
`VITE_API_URL`, only that host. Any other origin, or an unparsable URL, gets no header (fail closed),
and a 401 from another origin is rejected as is: no refresh, no retry, no expiry. The token lives in
the Redux store only, never in web storage.

### 401 refresh sequence

On a 401 from anything except `/auth/login`, `/auth/refresh`, `/auth/logout` and `skipAuthRefresh`
requests:

1. If the token was rotated while the request was in flight, retry at once with the current token.
2. Otherwise join the shared recovery: one `POST /auth/refresh` (httpOnly cookie, empty body).
   Concurrent 401s wait on the same promise, because the backend blacklists a consumed refresh
   token and a second refresh would end the session.
3. On success `onTokenRefreshed` stores the token and each waiter retries once with the new bearer.
4. If the refresh fails, `onSessionExpired()` runs once and every waiter rejects with the original
   401 `ApiError`.
5. A retry that gets 401 again expires the session once; no second refresh.

Expiry is deduplicated by token, so a burst of late 401s reports it once; `configureCmsApi` resets
the latch. `refreshAccessToken()` is the same function; it never calls `onSessionExpired` itself.

### Error shape

| Failure                                     | `status` | `message`                                                       |
| ------------------------------------------- | -------- | --------------------------------------------------------------- |
| Nest `{ message: 'text' }`                  | HTTP     | `'text'`                                                        |
| Nest `{ message: ['a', 'b'] }` (validation) | HTTP     | `'a, b'` (`messages` keeps `['a', 'b']`)                        |
| Any other body                              | HTTP     | `Request failed with status <status>`                           |
| Network error                               | 0        | `Cannot reach the server. Check your connection and try again.` |
| Timeout (`ECONNABORTED`, `ETIMEDOUT`)       | 0        | `The request timed out. Try again.`                             |
| Non-axios `Error`                           | 0        | the error's message                                             |
| Anything else thrown                        | 0        | `Something went wrong.` (`body` holds the value)                |

`code` is the axios error code; the client-side codes `ERR_CLIENT_FORBIDDEN` and
`ERR_CLIENT_VALIDATION` are added by the feature hooks.

### How later code must use it

- **Every HTTP call goes through `cmsApi`.** No other axios instance and no direct `fetch`, or the
  bearer and the refresh are lost.
- **RTK Query** uses `axiosBaseQuery`; errors are the plain `ApiErrorData`.
- **React Query** functions call `cmsApi` and let the `ApiError` propagate. Narrow with `isApiError`
  or `toApiError`; check `status === 403` for a forbidden state (401s are already handled).

### Decisions

- **401 recovery lives in the axios interceptor**, not in an RTK Query base query, so RTK Query and
  React Query share one refresh path.
- **Token in the store, client store-agnostic** through `configureCmsApi`, which avoids a circular
  import.
- **`ApiError` is a class** so `instanceof` and stacks work; RTK Query state holds a plain copy
  (`ApiErrorData`) because the store must stay serializable.
- **`code` is the axios code**, not Nest's `error` text, so it means the same for HTTP and network
  failures.

## Files

| File                           | Spec                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `src/core/api/CmsApi.ts`       | Exports `cmsApi`, `configureCmsApi`, `refreshAccessToken`, `CmsApiHandlers`. Bearer and refresh interceptors, expiry latch. |
| `src/core/api/apiError.ts`     | Exports `ApiError`, `ApiErrorInit`, `toApiError`, `isApiError`. The one error shape and its mapping.   |
| `src/core/api/axiosBaseQuery.ts` | Exports `axiosBaseQuery`, `AxiosQueryArgs`, `ApiErrorData`, `toApiErrorData`. RTK Query adapter.     |

## Testing

- `src/core/api/apiError.test.ts`: every row of the error table.
- `src/core/api/CmsApi.test.ts`: instance config, bearer only to the API origin, error mapping.
- `src/core/api/CmsApi.refresh.test.ts`: refresh, single-flight, expiry dedup, skip rules. Tests wire
  a fake session with `configureCmsApi` and count refresh calls in a `/auth/refresh` handler.
- `src/core/api/axiosBaseQuery.test.ts`: success and error mapping, `ApiErrorData` passthrough.
- `src/app/queryClient.integration.test.tsx`: a `useQuery` recovers from a 401 through one refresh.
- Run: `pnpm --filter cms-admin exec vitest run src/core/api`.

## Related

- [Auth session](./auth-session.md) (owns the token and wires `configureCmsApi`)
- [Testing and config](./testing-and-config.md) (`API_BASE_URL`, MSW defaults)
- [Content data](./content-data.md) and [Settings foundation](./settings-foundation.md) (React Query users)
