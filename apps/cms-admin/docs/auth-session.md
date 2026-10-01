# Auth session

The Redux store owns the whole session: the in-memory access token, the signed-in user, and the session status. RTK Query holds the auth endpoints. Thunks run the session lifecycle (bootstrap, login, logout), and a listener cleans up after an expired session. The shared React Query `QueryClient` lives next to the store, ready for Phase 2 data.

Source: `src/app/{store.ts,hooks.ts,queryClient.ts,AppProvider.tsx}`, `src/core/api/{AuthApi.ts,axiosBaseQuery.ts}`, `src/features/auth/{types.ts,store/*,hooks/*}`.

## State shape

`state.auth` (`AuthState`, `src/features/auth/types.ts`):

| Field         | Type                                                                     | Meaning                                                 |
| ------------- | ------------------------------------------------------------------------ | ------------------------------------------------------- |
| `status`      | `'idle' \| 'loading' \| 'authenticated' \| 'unauthenticated' \| 'error'` | `idle` before bootstrap, `error` when bootstrap gave up |
| `accessToken` | `string \| null`                                                         | The bearer token. Memory only, never in web storage     |
| `user`        | `MeUser \| null`                                                         | `GET /auth/me`; `user.role` is `Role \| null`           |
| `error`       | `string \| null`                                                         | The bootstrap error, or the last login error message    |

Reducers (`features/auth/store/AuthSlice.ts`): `tokenReceived(token)`, `userLoaded(user)` (sets `authenticated`), `statusChanged({ status, error? })`, `sessionCleared()` and `sessionExpired()` (both drop the token and user and end `unauthenticated`; only `sessionExpired` triggers the cache-reset listener).

Selectors (`features/auth/store/selectors.ts`, memoized with `createSelector`): `selectAuthStatus`, `selectIsAuthenticated`, `selectCurrentUser`, `selectRole`, `selectPermissions`. `selectPermissions` returns the same frozen `[]` whenever there is no user or no role, so components don't re-render for nothing.

## Store

`makeStore({ queryClient?, preloadedAuth? })` builds a store with the `auth` slice and the `authApi` reducer and middleware, and then calls `configureCmsApi`:

- `getAccessToken` reads `state.auth.accessToken`.
- `onTokenRefreshed` dispatches `tokenReceived`.
- `onSessionExpired` dispatches `sessionExpired`.

The last store built owns `cmsApi`. The app builds one (`store`), and each test builds its own. The `queryClient` is the thunk and listener extra argument (`StoreExtra`), so tests can pass a fresh one. Redux DevTools are on only in dev builds. Typed hooks: `useAppDispatch`, `useAppSelector` (`src/app/hooks.ts`). Types: `AppStore`, `RootState`, `AppDispatch`, `AppThunk<R>`.

## RTK Query auth API

`authApi` (`src/core/api/AuthApi.ts`) uses `axiosBaseQuery`, so it shares `cmsApi`'s bearer and error normalization. Errors are `ApiErrorData` (a plain copy of `ApiError`, see [API client](./api-client.md)).

| Endpoint   | Kind     | Request                           |
| ---------- | -------- | --------------------------------- |
| `hasUsers` | query    | `GET /auth/has-users`             |
| `login`    | mutation | `POST /auth/login` `LoginRequest` |
| `me`       | query    | `GET /auth/me`                    |
| `logout`   | mutation | `POST /auth/logout`               |

All four pass `skipAuthRefresh: true`: the thunks call them right after getting a token and decide what a 401 means. Refresh is not an endpoint: it is the shared single-flight `refreshAccessToken()`. Register, verify-OTP, resend, forgot and reset password come in small phase 1.6.

## Bootstrap

`bootstrapSession()` (`features/auth/store/sessionThunks.ts`) restores the session from the refresh cookie on page load:

1. `status = 'loading'`.
2. `refreshAccessToken()` → `tokenReceived(token)`. The token is stored before `/me` is called.
3. `GET /auth/me` → `userLoaded(user)` → `authenticated`.
4. A 401 from either call → `sessionCleared()` → `unauthenticated`, with no error message.
5. A network error (status 0), 5xx or 429 is retried after `BOOTSTRAP_RETRY_DELAYS_MS` = 2000, 5000 and 10000 ms, then `status = 'error'` with the message. Any other status (for example a 404 from `/me` when the role is missing) goes to `error` at once.

Once a refresh has succeeded, retries redo only `/me`: the refresh rotated and blacklisted the old cookie, so refreshing again would be pointless.

A module-level latch makes it run **once per page load**, so React StrictMode's double mount can't start two refreshes (which would log the user out, because the backend blacklists a consumed refresh token). `retryBootstrap()` (the Retry button) starts a new run, or joins the run still in flight. `resetBootstrapLatch()` is for tests only.

`useSessionBootstrap()` dispatches `bootstrapSession()` on mount. `AppProvider` runs it once, inside the Redux `Provider` and `QueryClientProvider`. The router is added by `App.tsx` in small phase 1.5.

## Login

`login({ email, password, rememberMe })`: `POST /auth/login` → `tokenReceived` → `GET /auth/me` → `authenticated`. It resolves with `LoginResult` (`{ ok: true }` or `{ ok: false, message }`) and never throws. On failure, the session is cleared, `status` is `unauthenticated` and `error` holds the message:

| Status | Message                                    |
| ------ | ------------------------------------------ |
| 401    | Invalid email or password.                 |
| 403    | Your email address isn't verified yet.     |
| 429    | Too many attempts. Please try again later. |
| other  | The normalized `ApiError` message          |

The login mutation result is reset right away, so the token never sits in the RTK Query state.

## Logout

`logout()` signs out locally first: `sessionCleared()`, `authApi.util.resetApiState()` and `queryClient.clear()`. Then it calls `POST /auth/logout` best-effort and ignores any failure. The final status is `unauthenticated`.

## Session expiry

When `cmsApi` cannot recover from a 401 (see [API client](./api-client.md#401-refresh-sequence)), it calls `onSessionExpired`, which dispatches `sessionExpired()`. A listener (`createListenerMiddleware`, in `makeStore`) then resets `authApi` and clears the React Query cache, so no data from the previous user survives. Phase 1.5's route guard sends the user to `/login`.

## QueryClient

`src/app/queryClient.ts` exports the shared `queryClient` and `makeQueryClient()` (for tests):

- `staleTime: 30_000`, `refetchOnWindowFocus: false`.
- Queries: `shouldRetryQuery` never retries a 4xx `ApiError` and retries anything else at most once.
- Mutations never retry.

Query functions call `cmsApi` directly and let the `ApiError` propagate. 401s are already handled by the client: a test shows a `useQuery` recovering from a 401 through one refresh.

## useAuth

`useAuth()` returns `{ status, user, role, permissions, login, logout, retryBootstrap }`. The actions dispatch the thunks above and return their promises.

```tsx
const { status, user, login } = useAuth();
const result = await login({ email, password, rememberMe });
if (!result.ok) setError(result.message);
```

## Testing

- `src/test/renderWithProviders.tsx`: `renderWithProviders(ui, { auth, route, store, queryClient })` and `renderHookWithProviders(hook, options)` give each test a fresh store, `QueryClient` and memory router, with a preloaded auth state. They do not run the bootstrap.
- `src/test/fixtures.ts`: `makeMeUser(overrides)`, `makeRole(overrides)`.
- MSW defaults (`src/test/msw/handlers.ts`): refresh → 401 (no session), logout → 200.
- Call `resetBootstrapLatch()` in `beforeEach` in any test that bootstraps.
- Bootstrap backoff tests use `vi.useFakeTimers({ toFake: ['setTimeout'] })` and `vi.advanceTimersByTimeAsync`.
- A test spies on `Storage.prototype.setItem` across bootstrap, login, refresh, expiry and logout and asserts it is never called.

## Cookie and proxy notes

The refresh token is an httpOnly cookie that the browser sends because `cmsApi` uses `withCredentials: true`. In dev, the Vite proxy makes the API same-origin, so the cookie is first-party on `localhost` (see [Testing and config](./testing-and-config.md#dev-proxy)). If login works but a reload logs the user out, check the backend's `COOKIE_SECURE` and `COOKIE_SAMESITE` settings: a `Secure` cookie is not stored over plain http. The token itself is never written to `localStorage`, `sessionStorage`, IndexedDB or a readable cookie.

## Decisions

- **Errors in RTK Query are plain objects** (`ApiErrorData`), because the store must stay serializable. `toApiErrorData` passes an existing `ApiErrorData` through, so code that catches an `unwrap()` rejection can normalize it the same way.
- **`login` resolves with a result instead of throwing**, so pages show `message` without a try/catch. It does not set `status = 'loading'`, so guards don't flash a loading view while the login form is pending.
- **Bootstrap 401 uses `sessionCleared`, not `sessionExpired`**: there was no previous session, so there is nothing to purge.
