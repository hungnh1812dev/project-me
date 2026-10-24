# @abyss/web

Public site. Next.js 16 (App Router) with React 19, run by Node in its own
container behind Traefik at `<domain>`; the API lives on the same origin under
`/api`. Decisions: [ADR 0004](../../docs/adr/0004-web-nextjs-app-router.md).

For now the app is a skeleton: one status page that calls
`GET /api/v1/health/live` from the browser and renders a status card built with
`@abyss/form-commons`.

## Run

```bash
cp .env.example .env.local     # then adjust
pnpm --filter @abyss/web dev       # http://localhost:5174
```

The dev port is `DEV_SERVER_PORT` from the shell environment (default 5174; a
`.env.local` value is loaded too late to set it). In dev, `next.config.ts`
forwards `/api` to `DEV_API_PROXY_TARGET` (a local cms-api) unchanged, like
Traefik does in production. That rewrite exists only for the dev server, never
in a production build.

`@abyss/form-commons` is consumed from its `dist/`, so build it once first
(`pnpm build` at the root does this through Turborepo's `^build`).

## Server and client code

- Server Components are the default. A file gets `'use client'` only for state,
  effects, handlers, browser APIs, TanStack Query, react-hook-form or any
  `@abyss/form-commons` import (form-commons has no `'use client'` directive,
  so import it only from client components).
- Code that reads server env or calls `API_INTERNAL_URL` imports `server-only`.
- The Next server never sends, receives or stores a user token. No Server
  Actions, Route Handlers or `cookies()` for auth: the browser calls the API
  with a Bearer token held in memory.

## Config

- `src/config/env.client.ts` reads `NEXT_PUBLIC_*` keys. They are inlined into
  the browser bundle at build time (so they are public, never secrets) and a
  missing `NEXT_PUBLIC_API_BASE_URL` fails the build.
- `src/config/env.server.ts` (`server-only`) reads `API_INTERNAL_URL` and
  `WEB_REVALIDATE_SECONDS` at runtime. An invalid value stops the server at
  start (`src/instrumentation.ts`). It is not run during `next build`.
- Every key is documented in [`.env.example`](.env.example).
- `src/config/endpoints.ts` is the single map of API paths.
- `src/config/copy.constants.ts` holds user-facing text until an i18n module
  exists.
- `config/**` may use pure `lib` helpers (`strip-trailing-slashes`,
  `safe-link-target`) but never `lib/api-client` or a feature (ESLint). Error
  codes live with their feature constants (`auth.constants`,
  `reviewer.constants`); third-party origins in `security.constants`.
- `src/lib/safe-link-target.ts` decides what may be an `href` (http(s) URL or
  same-origin path); `optionalLinkTarget` in `require-env.ts` uses it.
- `features/reviewer/reviewer.queries.ts` owns the reviewer API instance, the
  query key and `useReviewerEnabled()` (anonymous visitor plus Turnstile site
  key only).
- `src/lib/api-client.ts` is the browser Axios instance. It strips trailing
  slashes from every request path (SPEC §6), so no proxy can answer with a
  redirect.

Styling: Tailwind v4 through `@tailwindcss/postcss` with the form-commons theme
(`src/app/app.css`, imported by `src/app/layout.tsx`). Components use semantic
tokens only (`bg-card`, `text-muted-foreground`).

## Sign-in and session

- The header "Sign in" opens `WebLoginDialog` (email + password, then the 2FA
  code when the account has it). Calls go from the browser to
  `NEXT_PUBLIC_API_BASE_URL` (`/auth/login`, `/auth/2fa/verify`,
  `/auth/refresh`, `/auth/logout`, `/auth/me`); cms-api sets the host-only
  `__Secure-abyss_rt` refresh cookie (Path `/api/v1/auth`). No Server Action,
  Route Handler or `cookies()` call touches auth, and the Next server never
  sees a token.
- `features/session` owns the session: `useWebSession` and `WebSessionProvider`
  (mounted in `src/app/providers.tsx`), the auth API and the one
  `PrivilegedAccessError`. `features/auth` (sign-in dialog) and
  `features/reviewer` build on it and never import each other; `app/AccountMenu`
  composes them. Lint bans deep imports between features and test utilities in
  production code; `src/architecture.test.ts` fails on a directory cycle. The
  provider keeps the access token in memory only, tries one silent refresh on mount,
  and exposes `status`, `user`, `getAccessToken()`, sign-in, 2FA and sign-out.
- Reader roles only: after each sign-in or refresh, `/auth/me` `permissions`
  (`subject:action`) is checked. Any action other than `read` (editor, admin,
  owner) is privileged: the token is dropped, the web stays anonymous and the
  dialog points to the admin console. A missing list counts as privileged.
  A failed sign-out keeps the session and shows an error to retry.
- "Open CMS" links to `NEXT_PUBLIC_ADMIN_URL` (build-time, optional, http(s)
  URL or path); the admin signs in silently from the same cookie. Unset hides
  the link.
- No page refetches data per actor yet: the CV page was skipped, so the
  GraphQL refetch with the Bearer token has nothing to attach to.

## Reviewer access

- The header shows "Reviewer access" to anonymous visitors when cms-api's
  public `GET /reviewer/status` says the owner switched it on **and**
  `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set (build-time, public, optional).
- `ReviewerAccessDialog` (client component, form-commons + react-hook-form) has
  three steps: role (Recruiter, Peer / colleague, Other), purposes (Hiring,
  Project scoping, Networking, Other) and notes + Turnstile. No personal data
  is asked. `POST /reviewer/sessions` goes from the browser; the 24 h access
  token is held by `useWebSession` in memory (`kind: 'reviewer'`), never in
  storage and never sent to the Next server. There is no refresh cookie, so a
  reload ends the review; "End review" drops the token locally.
- Turnstile loads through `next/script` only while the dialog's last step is
  open (`challenges.cloudflare.com`, constant `TURNSTILE` in
  `src/config/security.constants.ts`). The CSP allows that origin in
  `script-src` and `frame-src`; `next/script` stamps the request nonce on it.
- There is no page to refetch per actor yet (the CV page was skipped), so the reviewer
  view today is the session itself; pages added later read the token with
  `useWebSession().getAccessToken()`.

## Docker

```bash
docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_BASE_URL=/api/v1 -t abyss-web .
docker run -e API_INTERNAL_URL=http://cms-api:3000/api/v1 -p 8080:8080 abyss-web
```

Multi-stage: `turbo prune`, a frozen install, `turbo run build`, then the
standalone server (`.next/standalone`, `.next/static`, `public/`) on Node as
the non-root `node` user. The build fails without `NEXT_PUBLIC_API_BASE_URL`; `NEXT_PUBLIC_ADMIN_URL` and `NEXT_PUBLIC_TURNSTILE_SITE_KEY` are optional build args.
Runtime env: `API_INTERNAL_URL`, `WEB_REVALIDATE_SECONDS`, `WEB_PORT` (default
8080). `HEALTHCHECK` requests `/`. Telemetry is off (`NEXT_TELEMETRY_DISABLED=1`).

## Scripts

| Script      | What it does                                                                                |
| ----------- | ------------------------------------------------------------------------------------------- |
| `dev`       | Next dev server (Turbopack)                                                                 |
| `build`     | Production build into `.next/` (standalone output)                                          |
| `start`     | Next production server on `WEB_PORT`                                                        |
| `test`      | Vitest + Testing Library (jsdom)                                                            |
| `lint`      | Oxlint (base-config + react, jsx-a11y, vitest) then ESLint (base-config, react-hooks, Next) |
| `typecheck` | `next typegen`, then `tsc --noEmit`                                                         |

## Security headers (SPEC D17)

- `src/proxy.ts` makes a fresh nonce per request and sets
  `Content-Security-Policy` on the forwarded request (Next.js stamps the nonce
  on its scripts) and on the response. The policy is built in
  `src/lib/content-security-policy.ts`: `script-src 'self' 'nonce-<n>'
'strict-dynamic'` + the Turnstile origin, `style-src 'self' 'nonce-<n>'` with
  `style-src-attr 'unsafe-inline'`, `connect-src 'self'` plus the origin
  of `NEXT_PUBLIC_API_BASE_URL` when it is absolute, `img-src` with Cloudinary,
  `frame-src` Turnstile, `frame-ancestors 'none'`. Dev adds `'unsafe-eval'` and
  `ws:`. Origins and header values are constants in `src/config/security*.ts`.
- Radix dialogs inject a scroll-lock `<style>` through react-remove-scroll-bar;
  `app/CspNonce.tsx` passes it the request nonce (`get-nonce` `setNonce`) so
  `style-src` stays nonce-only.
- `next.config.ts` adds HSTS, `nosniff` and `Referrer-Policy` to every route.
- The proxy matcher skips `/api/`, `/_next/static`, `/_next/image` and
  prefetches. The root layout awaits `connection()`, so every page renders per
  request (the server data cache from `WEB_REVALIDATE_SECONDS` still applies).
- `scripts/smoke.sh` asserts the headers, the nonce match and a fresh nonce
  per response.
