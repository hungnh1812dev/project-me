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
- **2FA**: a `requires2FA` login answer shows a placeholder until T13. The temp
  token is dropped.
- **Routes** (`src/config/routes.ts`): `/login`, and `/` behind
  `ProtectedRoute` + `AppShell` (header with the user and "Sign out").

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
