# Routing and guards

The app is one `createBrowserRouter` route table. Signed-in pages sit under a `RequireAuth` layout route, and permission-gated pages add a `RequireAccess` layout route below it. Pages are deliberately unstyled semantic HTML: Phase 3 restyles them.

Source: `src/app/router.tsx`, `src/App.tsx`, `src/features/auth/components/{RequireAuth,RequireAccess}.tsx`, `src/features/auth/{redirect.ts,permissions/access.ts,hooks/useCurrentUserQuery.ts}`, `src/pages/{login,profile,forbidden,admin-home,users}/`.

## Route table

| Path                                                              | Guard                                     | Page                                                        | Notes                                                       |
| ----------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------- |
| `/login`                                                          | none                                      | `LoginPage`                                                 | A signed-in user is sent on to `state.from` or `/admin`     |
| `/register`, `/verify-otp`, `/forgot-password`, `/reset-password` | none                                      | see [Onboarding and recovery](./onboarding-and-recovery.md) | Public onboarding and password recovery pages               |
| `/403`                                                            | none                                      | `ForbiddenPage`                                             | Shows the guard's reason and links to `/admin`              |
| `/admin`                                                          | `RequireAuth`                             | `AdminHomePage`                                             | Placeholder: greets the user by name, links to the profile  |
| `/admin/profile`                                                  | `RequireAuth`                             | `ProfilePage`                                               | Identity, role, permissions, Log out                        |
| `/admin/users`                                                    | `RequireAuth` → `RequireAccess user:read` | `UsersPage`                                                 | Placeholder until Phase 4; the first permission-gated route |
| `*`                                                               | —                                         | —                                                           | Redirects to `/admin`                                       |

`routes` is exported so tests can mount it in a memory router. `App.tsx` builds the browser router once (`createAppRouter()`) and renders `<AppProvider><RouterProvider router={router} /></AppProvider>`. `main.tsx` no longer imports the Vite template CSS.

## Guards

**`RequireAuth`** (layout route, renders `<Outlet />`) acts on `state.auth.status`:

| Status            | Renders                                                                             |
| ----------------- | ----------------------------------------------------------------------------------- |
| `idle`, `loading` | A full-screen `role="status"` "Connecting…" view                                    |
| `authenticated`   | The matched child route                                                             |
| `unauthenticated` | `<Navigate to="/login" replace state={{ from }}>`, `from` = path + query + hash     |
| `error`           | `role="alert"` "Can't reach the server." with a **Retry** button (`retryBootstrap`) |

Session expiry needs no extra code: `sessionExpired` makes the status `unauthenticated`, so the guard on the current page redirects to `/login` with that page in `from` (AC-29).

**`RequireAccess`** takes any of `permission` (+ `mode`, `contentTypeSlug`), `minLevel` and `can={{ I, a, with }}`. Every given check must pass (`checkAccess` in `permissions/access.ts`, in that order; the first denial wins). A denial redirects to `/403` with `state = { reason, from }`. It renders `children` when given, else `<Outlet />`. Put it inside `RequireAuth`: signed out, the actor has no permissions, so it would always send the user to `/403`.

### Protecting a new route

```tsx
// src/app/router.tsx, inside the /admin children
{
  path: 'roles',
  element: <RequireAccess permission="role:read" />,
  children: [{ index: true, element: <RolesPage /> }],
},
// or a level floor / an ABAC policy:
<RequireAccess minLevel={ROLE_LEVEL.ADMIN} />
<RequireAccess can={{ I: 'configure', a: 'content_type' }} />
```

For controls inside a page, use `<Can>` or the hooks from [RBAC and ABAC](./rbac-abac.md) instead.

## Pages

- **Login** (`/login`): labelled email (`type="email"`, required) and password (required) fields, a "Remember me" checkbox (sent as `rememberMe`), and a submit button that is disabled while the request is pending **and while the session bootstrap is still running** (a bootstrap 401 landing after a successful login would otherwise clear the new session). Errors from the `login` thunk (AC-14 messages) show in `role="alert"`. Once the status is `authenticated`, the page redirects to `redirectTarget(state)`: `state.from` when it is a safe in-app path (starts with `/`, not `//` or `/\`, not `/login`), else `/admin`. The same rule redirects a user who is already signed in. When `GET /auth/has-users` answers `false` (a fresh install), the page redirects to `/register` instead. It also shows a `role="status"` notice from `state.notice` (after verifying an email or resetting a password) and links to `/forgot-password` and `/register` (see [Onboarding and recovery](./onboarding-and-recovery.md)).
- **Profile** (`/admin/profile`): name, username, email, verified state; role name, slug and level or "No role assigned"; the permission list (or "No permissions"); **Log out** (the `logout` thunk; the guard then lands the user on `/login`). It refetches the user with `useCurrentUserQuery()` (React Query, `GET /auth/me` through `cmsApi`, so a 401 is refreshed transparently and an unrecoverable 401 ends the session). If that refetch fails, it keeps showing the session user with a `role="alert"` notice.
- **403** (`/403`): "Access denied", the reason from the guard when there is one, and a link to `/admin`.

## Decisions

- **`/admin/users` placeholder.** SPEC lists no permission-gated route in Phase 1, but AC-30 needs one to test the `/403` flow end to end. `/admin/users` (gated by `user:read`) is the smallest real candidate: Phase 4 replaces the placeholder page.
- **Profile refetch through `cmsApi`.** The `authApi.me` endpoint skips the 401 refresh on purpose (the session thunks own that). The profile uses `useCurrentUserQuery()` instead, which is the first page-level data call and the one the expiry e2e flows go through.
- **Logout keeps `from`.** Log out clears the session, and `RequireAuth` redirects to `/login` with the current page in `from`. Signing in again returns there, as after an expiry.
- **`state.from` is validated** before navigating, so a crafted history state can't send the user off-site.

## E2E fixture (`mockApi`)

Specs import `test` and `expect` from `e2e/fixtures/mockApi.ts`. The auto fixture routes `**/api/v1/**` to an in-test fake backend and records every call as `{ method, path, status }` in `mockApi.requests`.

| Modelled              | Behaviour                                                                                       |
| --------------------- | ----------------------------------------------------------------------------------------------- |
| `GET /auth/has-users` | `true` once a user was added                                                                    |
| `POST /auth/login`    | 401 for an unknown email or wrong password, 403 when unverified, else a token and a new session |
| `POST /auth/refresh`  | 401 without a session, else rotates the session and issues a token                              |
| `POST /auth/logout`   | Ends the session, always 200                                                                    |
| `GET /auth/me`        | 401 unless the bearer token is a live one, else the user                                        |
| Register, OTP, reset  | See [Onboarding and recovery](./onboarding-and-recovery.md#e2e)                                 |

Helpers: `addUser({ email, password?, name?, username?, verified?, role? })` (default role `ROLES.editor`, default password `DEFAULT_PASSWORD`), `signInAs(email)` (a refresh-cookie session as if from an earlier visit, so `page.goto` bootstraps signed in), `expireAccessTokens()`, `revokeSession()`, `failNext(method, path, status, times?)`, and `resetTokenFor(email)`. The "cookie" lives in the fixture, not the browser, so it survives `page.reload()` within a test.

`e2e/auth.spec.ts` covers login → `/admin` → profile, invalid credentials, unverified email, deep link → login → return, reload, logout, `/403` (and the allowed case), a transparent mid-session refresh, an unrefreshable session → `/login` → return after re-login, and a bootstrap error → Retry. The last one uses `page.clock` to skip the 2 s/5 s/10 s backoff.

Run: `pnpm --filter cms-admin test:e2e` (set `PLAYWRIGHT_BROWSERS_PATH=0` when the browsers are installed in `node_modules`).

## Manual smoke (real backend)

2026-10-01, backend on `:8080`, `vite` dev server through the `/api` proxy: the app shell loads at `/admin/profile`; `GET /api/v1/auth/has-users` → 200 `{ hasUsers: true }`; `POST /api/v1/auth/refresh` without a cookie → 401; `POST /api/v1/auth/login` with bad credentials → 401 "Invalid email or password". The credentialed login → reload → profile → logout pass is still to be run by someone with an account (see the Phase 1.5 checkpoint).
