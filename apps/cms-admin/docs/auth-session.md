# Auth session

The Redux store owns the whole session: the in-memory access token, the signed-in user and the
session status. RTK Query holds the auth endpoints, thunks run bootstrap, login and logout, and a
listener purges caches after an expired session. The shared React Query `QueryClient` lives next to
the store. Every signed-in feature reads the user from here.

## Feature

### State

`state.auth` (`AuthState`):

| Field         | Type                                                                     | Meaning                                                 |
| ------------- | ------------------------------------------------------------------------ | ------------------------------------------------------- |
| `status`      | `'idle' \| 'loading' \| 'authenticated' \| 'unauthenticated' \| 'error'` | `idle` before bootstrap, `error` when bootstrap gave up |
| `accessToken` | `string \| null`                                                         | The bearer token. Memory only, never in web storage     |
| `user`        | `MeUser \| null`                                                         | `GET /auth/me`; `user.role` is `Role \| null`           |
| `error`       | `string \| null`                                                         | The bootstrap error, or the last login error message    |

Reducers: `tokenReceived(token)`, `userLoaded(user)` (sets `authenticated`), `statusChanged`,
`sessionCleared()` and `sessionExpired()` (both drop token and user and end `unauthenticated`; only
`sessionExpired` triggers the cache-reset listener).

Selectors (memoized): `selectAuth`, `selectAuthStatus`, `selectIsAuthenticated`,
`selectCurrentUser`, `selectRole`, `selectPermissions` (the same frozen `[]` without a user or role,
so components don't re-render for nothing), `selectRoleLevel` (0 without a role) and `selectActor`
(recomputed only when the user changes; used by [RBAC and ABAC](./rbac-abac.md)).

### Store

`makeStore({ queryClient?, preloadedAuth? })` builds the `auth` slice plus the `authApi` reducer and
middleware, then calls `configureCmsApi` (see [API client](./api-client.md)). The last store built
owns `cmsApi`: the app builds one (`store`), each test its own. The `queryClient` is the thunk and
listener extra argument (`StoreExtra`). Redux DevTools only in dev. Typed hooks `useAppDispatch`,
`useAppSelector`.

### RTK Query auth API

`authApi` uses `axiosBaseQuery`; errors are `ApiErrorData`. Endpoints: `hasUsers`
(`GET /auth/has-users`), `login`, `me`, `logout`, plus the onboarding endpoints documented in
[Onboarding and recovery](./onboarding-and-recovery.md). All pass `skipAuthRefresh: true`: the
thunks decide what a 401 means. Refresh is not an endpoint; it is `refreshAccessToken()`.

### Bootstrap

`bootstrapSession()` restores the session from the refresh cookie on page load:

1. `status = 'loading'`.
2. `refreshAccessToken()` → `tokenReceived` (stored before `/me`).
3. `GET /auth/me` → `userLoaded` → `authenticated`.
4. A 401 from either → `sessionCleared()` → `unauthenticated`, no error message.
5. Status 0, 5xx or 429 retries after `BOOTSTRAP_RETRY_DELAYS_MS` (2000, 5000, 10000 ms), then
   `error`. Any other status goes to `error` at once.

After a successful refresh, retries redo only `/me` (the old cookie is already blacklisted). A
module-level latch makes it run **once per page load**, so StrictMode's double mount can't start two
refreshes. `retryBootstrap()` starts a new run or joins the one in flight; `resetBootstrapLatch()` is
for tests. `useSessionBootstrap()` dispatches it on mount inside `AppProvider`.

### Login and logout

`login({ email, password, rememberMe })`: `POST /auth/login` → `tokenReceived` → `GET /auth/me` →
`authenticated`. It resolves `{ ok: true }` or `{ ok: false, message }` and never throws. Messages
(`loginErrorMessage`): 401 "Invalid email or password.", 403 "Your email address isn't verified
yet.", 429 "Too many attempts. Please try again later.", else the `ApiError` message. The mutation
result is reset at once, so the token never sits in RTK Query state.

`logout()` signs out locally first (`sessionCleared`, `authApi.util.resetApiState()`,
`queryClient.clear()`), then calls `POST /auth/logout` best-effort.

### Session expiry

When `cmsApi` can't recover from a 401 it dispatches `sessionExpired()`. A listener resets `authApi`
and clears the React Query cache, so no data of the previous user survives; `RequireAuth` then sends
the user to `/login` with the page in `from`.

### QueryClient

`makeQueryClient()` / `queryClient`: `staleTime: 30_000`, `refetchOnWindowFocus: false`;
`shouldRetryQuery` never retries a 4xx `ApiError` and retries anything else once; mutations never
retry.

### `useAuth` and `useCurrentUserQuery`

`useAuth()` returns `{ status, user, role, permissions, login, logout, retryBootstrap }`.
`useCurrentUserQuery()` refetches `GET /auth/me` through React Query and `cmsApi`
(`CURRENT_USER_QUERY_KEY` = `['auth', 'me']`), so a 401 is refreshed transparently; the profile page
and the settings hooks write to this key.

### Cookie notes

The refresh token is an httpOnly cookie sent because `cmsApi` uses `withCredentials`. If login works
but a reload logs out, check the backend's `COOKIE_SECURE` and `COOKIE_SAMESITE`: a `Secure` cookie
is not stored over plain http.

### Decisions

- **Errors in RTK Query are plain objects** (`ApiErrorData`) so the store stays serializable.
- **`login` resolves with a result instead of throwing**, and does not set `loading`, so guards
  don't flash a loading view while the form is pending.
- **Bootstrap 401 uses `sessionCleared`, not `sessionExpired`**: there was no session to purge.
- **The token is never persisted.** A test spies on `Storage.prototype.setItem` across the whole
  lifecycle.

## Files

| File                                          | Spec                                                                                                  |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `src/app/store.ts`                            | Exports `makeStore`, `store`, `StoreExtra`, `MakeStoreOptions`, `AppStore`, `RootState`, `AppDispatch`, `AppThunk`. Store, expiry listener, `configureCmsApi` wiring. |
| `src/app/hooks.ts`                            | Exports `useAppDispatch`, `useAppSelector`.                                                           |
| `src/app/queryClient.ts`                      | Exports `queryClient`, `makeQueryClient`, `shouldRetryQuery`. React Query defaults.                   |
| `src/app/AppProvider.tsx`                     | Default export `AppProvider`: Redux, React Query and theme providers; runs the bootstrap once.        |
| `src/core/api/AuthApi.ts`                     | Exports `authApi`: has-users, login, me, logout and the onboarding endpoints, all `skipAuthRefresh`.  |
| `src/features/auth/types.ts`                  | Auth types: `Role`, `MeUser`, `AuthStatus`, `AuthState`, request and response shapes.                |
| `src/features/auth/store/AuthSlice.ts`        | Exports `initialAuthState`, the five actions, default reducer.                                        |
| `src/features/auth/store/selectors.ts`        | Exports the memoized auth, role, permission, level and actor selectors.                              |
| `src/features/auth/store/sessionThunks.ts`    | Exports `bootstrapSession`, `retryBootstrap`, `resetBootstrapLatch`, `login`, `logout`, `loginErrorMessage`, `BOOTSTRAP_RETRY_DELAYS_MS`, `LoginResult`. |
| `src/features/auth/hooks/useAuth.ts`          | Exports `useAuth`: session state plus bound thunks.                                                   |
| `src/features/auth/hooks/useSessionBootstrap.ts` | Exports `useSessionBootstrap`: dispatches the bootstrap on mount.                                 |
| `src/features/auth/hooks/useCurrentUserQuery.ts` | Exports `useCurrentUserQuery`, `CURRENT_USER_QUERY_KEY`. `/auth/me` through React Query.          |

## Testing

- `src/app/store.test.ts`, `src/app/AppProvider.test.tsx`, `src/app/queryClient.test.ts`,
  `src/app/queryClient.integration.test.tsx` (401 recovery through React Query, AC-17).
- `src/core/api/AuthApi.test.ts`: every endpoint's request and `skipAuthRefresh`.
- `src/features/auth/store/AuthSlice.test.ts`, `selectors.test.ts`, `sessionThunks.test.ts`
  (bootstrap backoff with `vi.useFakeTimers({ toFake: ['setTimeout'] })`, login messages, logout,
  no web-storage writes).
- `src/features/auth/hooks/useAuth.test.ts`, `useSessionBootstrap.test.tsx`,
  `useCurrentUserQuery.test.ts`.
- Call `resetBootstrapLatch()` in `beforeEach` in any test that bootstraps.
- E2E flows (login, reload, logout, expiry, bootstrap Retry) are in `e2e/auth.spec.ts`, see
  [Routing and guards](./routing-and-guards.md).
- Run: `pnpm --filter cms-admin exec vitest run src/app src/features/auth/store src/features/auth/hooks`.

## Related

- [API client](./api-client.md)
- [RBAC and ABAC](./rbac-abac.md) (reads the actor)
- [Routing and guards](./routing-and-guards.md) (`RequireAuth`, login page)
- [Onboarding and recovery](./onboarding-and-recovery.md) (the other `authApi` endpoints)
- [Theme](./theme.md) (`ThemeProvider` inside `AppProvider`)
