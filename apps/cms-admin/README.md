# @abyss/cms-admin

Admin console. React 19 + Vite, served by nginx at `admin.<domain>`; it calls the API cross-origin (CORS with credentials, `ADMIN_ORIGIN` in cms-api).

So far: sign-in (T11) and, behind it, a status page that calls
`GET /api/v1/health/live`.

## Auth (T11, D14)

- **Session state**: Redux Toolkit `authSlice` (`src/features/auth/auth.slice.ts`):
  `status` (`unknown` until the start-up refresh settles, then
  `authenticated` / `anonymous`), the access token and the `/me` user. The
  access token lives **in memory only**: never in localStorage,
  sessionStorage or JS cookies. The Redux DevTools hook is off in production
  builds. The refresh token is the API's HttpOnly `__Secure-abyss_rt` cookie,
  which JS never sees.
- **Session lifecycle**: `src/features/auth/session.ts` (`restore`, `signIn`,
  `signOut`, `expire`), wired in `src/app/app-services.ts`. Every refresh goes
  through one single-flight call. The cookie rotates on use, so two parallel
  refreshes would look like token reuse and revoke the session.
- **Across tabs** (T11a): `src/lib/cross-tab-refresh.ts`. Tabs take turns
  under the Web Lock `abyss-admin:refresh`; the tab that refreshes posts the
  new access token on the BroadcastChannel `abyss-admin:session`, and a tab
  that waited uses it instead of sending its own refresh. If the message is
  late, the waiting tab refreshes with the already rotated cookie (a normal
  rotation). Without Web Locks each tab refreshes alone and cms-api's 10 s
  grace window for a just-rotated token keeps the session alive. The token
  only travels between same-origin tabs in memory, never into storage.
- **Start-up**: `main.tsx` calls `session.restore()` once, outside React. Until
  it settles, protected routes show "Restoring your session" instead of the
  login page.
- **Interceptor**: `src/lib/auth-interceptor.ts` adds `Authorization: Bearer`.
  On a 401 from a protected call it refreshes once, and concurrent 401s wait
  for that same refresh. It then retries each call once. If the refresh fails,
  or a retried call gets 401 again, the session ends and the router shows
  `/login`. Requests flagged `skipAuthRefresh` (login, refresh, logout) are
  never retried.
- **Login errors** are generic (`login-error.ts`): incorrect credentials (any
  4xx), rate limited (429; uses `Retry-After` when cms-api exposes it via CORS,
  otherwise a generic wait message), network, unexpected.
- **2FA (T13)**: a `requires2FA` login answer opens `TwoFactorModal` (native
  `<dialog>` via `src/components/Modal.tsx`: focus trap, Esc closes). The temp
  token stays in component state only. TOTP accounts type the app code;
  email accounts get the code sent once on open (`use-email-code.ts`, resend
  blocked for the 429 `Retry-After`) and a warning that TOTP is safer. A dead
  temp token (5 wrong codes or 300 s) closes the dialog with a notice.
- **Security settings** (`src/features/security`, `/settings/security`,
  linked as "Security" in the header): 2FA status, TOTP setup (QR drawn
  client-side with `qrcode.react` from the `otpauth://` URI, plus the
  grouped manual key), email codes, turn off, all confirmed with code +
  current password in dialogs; change password, which ends every session:
  `session.expire('password-changed')` and the sign-in page shows why
  (`auth.endNotice`). Re-auth failures come back as 403, so the interceptor
  never treats them as an expired session.
- **Access (T18)** (`src/features/access`): `/accounts` (paged list, invite
  dialog, disable with a named confirmation, Enable and Resend invite without
  confirmation (T18a), shown only on manageable rows and with `accounts:update` /
  `accounts:create`), `/roles` and `/roles/:roleId`
  (permission matrix: subjects x actions; content rows open readable /
  writable field pickers fed by `GET /content-types`, sensitive fields
  flagged, and a collapsed "Advanced: row conditions" JSON textarea that the
  server validates). Saving sends the whole permission set (`PUT
/roles/:id/permissions`); 400 issues and `PERMISSION_NOT_HELD` indexes are
  mapped back to matrix rows. Actions are hidden from the caller's own role
  rows in `GET /roles` (`caller-access.ts`; owner = all; Accounts / Roles nav
  links hidden when not readable). This is only a hint: cms-api enforces
  every rule and its answers (403, 404, 409) are handled in the UI. Dialogs
  use the form-commons Radix `Dialog`; `components/Modal.tsx` (native
  `<dialog>`, 2FA) is unchanged.
- **API tokens (T19)** (`/api-tokens`, `ApiTokensPage.tsx`): paged list
  (name + token prefix, access summary, derived status, expiry, last used;
  "Created by" appears when the list holds other accounts' tokens). Create
  and Edit share `TokenFormDialog` (name, optional expiry date = end of that
  day in the user's time zone, a content-only permission grid with field
  pickers). Creating switches the same dialog to `TokenReveal`: the raw token
  is shown once, with Copy, and can only be closed with "I have copied it"
  (no Esc or outside click). It lives only in that component's state
  (the create mutation has `gcTime: 0`) and is never in the list or any
  cache. Edit sends only the changed fields (`name`, `scope`, `expiresAt`);
  no change, no request. Revoke asks for a named confirmation. Create needs
  `api_tokens:create`; Edit and Revoke need `api_tokens:update` and are
  hidden on revoked tokens; the nav link needs `api_tokens:read`. Grid cells
  the caller's role does not hold are disabled (hint only); a 403
  `API_TOKEN_SCOPE_NOT_HELD` marks the refused cells by `details.indexes`.
- **Routes** (`src/config/routes.ts`): `/login`, `/reset-password`,
  `/set-password`, and `/`, `/settings/security`, `/accounts`, `/roles`,
  `/roles/:roleId`, `/api-tokens` behind `ProtectedRoute` + `AppShell` (header with the
  user, Accounts / Roles links, "Security" and "Sign out").

End-to-end coverage lives in [`apps/e2e`](../e2e/README.md).

## Run

```bash
cp .env.example .env.local     # then adjust
pnpm --filter @abyss/cms-admin dev       # http://localhost:5173 (DEV_SERVER_PORT)
```

`@abyss/form-commons` is consumed from its `dist/`, so build it once first
(`pnpm build` at the root does this through Turborepo's `^build`).

## Config

- `src/config/env.ts` is the only module that reads `import.meta.env`. Every
  key is documented in [`.env.example`](.env.example). `VITE_*` values are
  baked in at build time, so they are public: never put secrets there.
- `src/config/endpoints.ts` is the single map of API paths.
- `src/config/copy.constants.ts` holds user-facing text until an i18n module
  exists.
- `src/lib/api-client.ts` is the Axios instance. It strips trailing slashes
  from every request path (SPEC §6), so no proxy can answer with a redirect.

Styling: Tailwind v4 with the form-commons theme (`src/styles/app.css`).
Components use semantic tokens only (`bg-card`, `text-muted-foreground`).

## Docker

```bash
docker build -f apps/cms-admin/Dockerfile --build-arg VITE_API_BASE_URL=... -t abyss-cms-admin .
```

Multi-stage: `turbo prune`, build (form-commons first), then the static files
on `nginx-unprivileged` (non-root, port 8080). `nginx.conf` sets
`absolute_redirect off; port_in_redirect off;` so nginx never redirects to its
internal host or port behind Traefik, and falls back to `index.html` for client
routes. The build fails without `VITE_API_BASE_URL`.

## Scripts

| Script      | What it does                                                                  |
| ----------- | ----------------------------------------------------------------------------- |
| `dev`       | Vite dev server                                                               |
| `build`     | Production bundle in `dist/`                                                  |
| `test`      | Vitest + Testing Library (jsdom)                                              |
| `lint`      | Oxlint (react, jsx-a11y, vitest) then ESLint (typescript-eslint, react-hooks) |
| `typecheck` | `tsc --noEmit`                                                                |
