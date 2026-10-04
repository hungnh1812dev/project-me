# Routing and guards

The app is one `createBrowserRouter` route table. Signed-in pages sit under a `RequireAuth` layout
route, then the `AppShell` layout route, and permission-gated pages add a `RequireAccess` layout
route below that. This module also owns the app entry, the login, home and 403 pages, and the
e2e auth backend (`mockApi`).

## Feature

### Route table

| Path                                                              | Guard                                                              | Page                                                                                | Notes                                                                                     |
| ----------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `/login`                                                          | none                                                               | `LoginPage`                                                                         | `AuthLayout`. A signed-in user goes on to `state.from` or `/admin`                        |
| `/register`, `/verify-otp`, `/forgot-password`, `/reset-password` | none                                                               | see [Onboarding and recovery](./onboarding-and-recovery.md)                         | `AuthLayout`                                                                              |
| `/403`                                                            | none                                                               | `ForbiddenPage`                                                                     | `AuthLayout`. Shows the guard's reason, links to `/admin`                                 |
| `/admin`                                                          | `RequireAuth` → `AppShell`                                         | `AdminHomePage`                                                                     | Welcome card with a profile link                                                          |
| `/admin/profile`                                                  | `RequireAuth` → `AppShell`                                         | `ProfilePage`                                                                       | See [Profile](./profile.md)                                                               |
| `/admin/users`                                                    | `RequireAuth` → `AppShell`                                         | —                                                                                   | Redirects (`replace`) to `/admin/settings/users`                                          |
| `/admin/settings/<key>`                                           | `RequireAuth` → `AppShell` → `RequireAccess <res>:read`            | `UsersPage`, `RolesPage`, `PermissionsPage`, `AccessTokensPage`, `MediaLibraryPage` | Mapped by `SETTINGS_PAGES`, a required `Record` with no placeholder fallback              |
| `/admin/content-types`, `/admin/content-types/:slug`              | `RequireAuth` → `AppShell` → `RequireAccess can read content_type` | `ContentTypesPage`, `ContentTypePage`                                               | See [Content-type pages](./content-type-pages.md)                                         |
| `/admin/content-types/:slug/new`                                  | same                                                               | `DocumentCreatePage`                                                                | The static `new` wins over `:documentId`. See [Document editor](./document-editor.md)     |
| `/admin/content-types/:slug/:documentId`                          | same                                                               | `DocumentDetailPage`                                                                | See [Document editor](./document-editor.md)                                               |
| `/admin/dev/ui-kit`                                               | `RequireAuth` → `AppShell`                                         | `UiKitPage` (lazy)                                                                  | Dev builds only, see [Design system](./design-system.md)                                  |
| `*`                                                               | —                                                                  | —                                                                                   | Redirects to `/admin`                                                                     |

`routes` is exported so tests can mount it in a memory router. `App.tsx` builds the browser router
once (`createAppRouter()`) inside `AppProvider`; `main.tsx` mounts `App` in `StrictMode` and imports
`globals.css`.

### Guards

**`RequireAuth`** (layout route) acts on `state.auth.status`:

| Status            | Renders                                                                             |
| ----------------- | ----------------------------------------------------------------------------------- |
| `idle`, `loading` | A full-screen `role="status"` "Connecting…" view                                    |
| `authenticated`   | The matched child route                                                             |
| `unauthenticated` | `<Navigate to="/login" replace state={{ from }}>`, `from` = path + query + hash     |
| `error`           | `role="alert"` "Can't reach the server." with **Retry** (`retryBootstrap`)          |

Session expiry needs no extra code: `sessionExpired` makes the status `unauthenticated`, so the guard
redirects with the current page in `from` (AC-29).

**`RequireAccess`** takes any of `permission` (+ `mode`, `contentTypeSlug`), `minLevel` and
`can={{ I, a, with }}`; every given check must pass (`checkAccess`, first denial wins). A denial
redirects to `/403` with `state = { reason, from }` (`ForbiddenState`). It renders `children` or
`<Outlet />`. Always put it inside `RequireAuth`. To protect a new route add a child with
`element: <RequireAccess permission="role:read" />` (or `minLevel`, or `can`). Controls inside a page
use `<Can>` or the hooks from [RBAC and ABAC](./rbac-abac.md).

### Pages

- **Login** (`/login`): email, password and "Remember me" (`rememberMe`). Submit is disabled while
  the request is pending **and while the bootstrap is still running** (a late bootstrap 401 would
  clear the new session). Login errors show in `role="alert"`. Once `authenticated`, it navigates to
  `redirectTarget(state)`: `state.from` when it is a safe in-app path (starts with `/`, not `//` or
  `/\`, not `/login`), else `/admin`. `has-users === false` redirects to `/register`. It shows the
  `state.notice` and links to `/forgot-password` and `/register` (see
  [Onboarding and recovery](./onboarding-and-recovery.md)).
- **Home** (`/admin`): "Welcome, <name>" card with a link to the profile.
- **403** (`/403`): "Access denied", the guard's reason, a link to `/admin`.

### E2E auth backend (`mockApi`)

The auto fixture records every call as `{ method, path, status }` in `mockApi.requests`.

| Modelled              | Behaviour                                                                                       |
| --------------------- | ----------------------------------------------------------------------------------------------- |
| `GET /auth/has-users` | `true` once a user was added                                                                    |
| `POST /auth/login`    | 401 unknown email or wrong password, 403 unverified, else a token and a new session             |
| `POST /auth/refresh`  | 401 without a session, else rotates the session and issues a token                              |
| `POST /auth/logout`   | Ends the session, always 200                                                                    |
| `GET /auth/me`        | 401 unless the bearer is live, else the user                                                    |

Helpers: `addUser({ email, password?, name?, username?, verified?, role? })` (default role
`ROLES.editor`, password `DEFAULT_PASSWORD`), `signInAs(email)` (a refresh-cookie session, so
`page.goto` bootstraps signed in), `expireAccessTokens()`, `revokeSession()`,
`failNext(method, path, status, times?)`, `resetTokenFor(email)`, `latestAccessToken(email)`. The
"cookie" lives in the fixture, so it survives `page.reload()`.

### Decisions

- **`/admin/users` placeholder.** AC-30 needed a gated route to test `/403` end to end; Phase 3 moved
  it to `/admin/settings/users`, and the old path redirects.
- **The shell is a layout route** between `RequireAuth` and the pages, so it renders only for a
  signed-in user and owns the only `<main>`. `/403` stays outside it, so a denied user never sees a
  menu they can't use.
- **Logout keeps `from`**: signing in again returns to the same page, as after an expiry.
- **`state.from` is validated** before navigating, so a crafted history state can't send the user
  off-site.

### Manual smoke

2026-10-01, backend on :8080 through the dev proxy: the shell loads; `has-users` → 200; refresh
without a cookie → 401; login with bad credentials → 401. The credentialed login → reload → profile
→ logout pass is still to be run by someone with an account.

## Files

| File                                          | Spec                                                                                        |
| --------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `src/main.tsx`                                | Mounts `App` in `StrictMode`, imports `globals.css`.                                        |
| `src/App.tsx`                                 | Default export `App`: builds the router once inside `AppProvider`.                          |
| `src/app/router.tsx`                          | Exports `routes`, `createAppRouter`. The route table, `SETTINGS_PAGES`, the dev-only UI kit. |
| `src/features/auth/components/RequireAuth.tsx`| Default export `RequireAuth`: status-driven layout guard.                                   |
| `src/features/auth/components/RequireAccess.tsx` | Default export `RequireAccess`, `RequireAccessProps`, `ForbiddenState`. Redirects to `/403` with the reason. |
| `src/features/auth/redirect.ts`               | Exports `redirectTarget`, `toRedirectState`, `RedirectState`, `DEFAULT_AFTER_LOGIN`. Safe post-login target. |
| `src/pages/login/LoginPage.tsx`               | Default export `LoginPage`: sign-in form, first-run redirect, notices.                       |
| `src/pages/admin-home/AdminHomePage.tsx`      | Default export `AdminHomePage`: welcome card.                                               |
| `src/pages/forbidden/ForbiddenPage.tsx`       | Default export `ForbiddenPage`: access denied with the reason.                              |

The `mockApi` fixture file is listed under [Testing and config](./testing-and-config.md), which owns
it; its auth behaviour is described here.

## Testing

- `src/app/router.test.tsx`: the route table, redirects, the dev-only UI kit registration.
- `src/App.test.tsx`; `src/features/auth/components/RequireAuth.test.tsx`, `RequireAccess.test.tsx`;
  `src/features/auth/redirect.test.ts`.
- `src/pages/login/LoginPage.test.tsx` (including the `has-users` cache regression),
  `src/pages/admin-home/AdminHomePage.test.tsx`, `src/pages/forbidden/ForbiddenPage.test.tsx`.
- `e2e/auth.spec.ts`: login → `/admin` → profile, invalid credentials, unverified email, deep link →
  login → return, reload, logout, `/403` and the allowed case, a transparent mid-session refresh, an
  unrefreshable session → `/login` → return, and a bootstrap error → Retry (`page.clock` skips the
  backoff).
- Run: `pnpm --filter cms-admin exec vitest run src/app/router.test.tsx src/pages/login` and
  `PLAYWRIGHT_BROWSERS_PATH=0 pnpm --filter cms-admin test:e2e e2e/auth.spec.ts`.

## Related

- [Auth session](./auth-session.md), [RBAC and ABAC](./rbac-abac.md)
- [App shell](./app-shell.md) (the layout route and `AuthLayout`)
- [Onboarding and recovery](./onboarding-and-recovery.md), [Profile](./profile.md)
- [Settings foundation](./settings-foundation.md), [Content-type pages](./content-type-pages.md)
- [Testing and config](./testing-and-config.md)
