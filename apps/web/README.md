# @abyss/web

Public site. Next.js 16 (App Router) with React 19, run by Node in its own
container behind Traefik at `<domain>`; the API lives on the same origin under
`/api`. Decisions: [ADR 0004](../../docs/adr/0004-web-nextjs-app-router.md).

Routes:

- `/` is the CV page. `app/page.tsx` (Server Component) loads the `CvPage`
  GraphQL document through `features/cv` (`loadCvPage`, public role) and hands
  it to the client `CvView`. Anonymous visitors see the server data; a signed-in
  account or a reviewer session refetches the same document from the browser
  with its own Bearer token (`useCvContent`, keyed by actor), and sign-out
  returns to the server data. No main resume gives an empty state. `CvView`
  renders `ContactCard` (cv-contact) and `ResumeSections` (summary, skills,
  experience, education, languages, referees; an empty section is not drawn).
  A field named in `_maskedFields` shows `MaskedPlaceholder` ("Sign in to
  view"), never the value. Richtext is sanitized where data enters the page:
  `loadCvPage` (server, `SafeRichtext.server`) and `useCvContent` (browser
  refetch, `SafeRichtext.rules`) both call `sanitizeCvRichtext`, so the
  components only see clean HTML.
- `app/error.tsx` is the error state for any page (client component, "Try
  again" calls Next's `retry`). It never reads the thrown error, so no server
  message and no other visitor's data is shown. A failure while the page
  streams cannot change the HTTP status: the response is already `200 OK` and
  the error UI arrives inside the stream (Next 16 streaming guide, "Status
  codes"); a failure before the first byte is a `500`.
- `/status` is the API status card (`GET /api/v1/health/live` from the browser,
  built with `@abyss/form-commons`). It is not linked from the header. It answers 404 unless
  `WEB_STATUS_PAGE_ENABLED=true` (read per request, ADR 0014).

## Run

```bash
cp .env.example .env.local     # then adjust
pnpm --filter @abyss/web dev       # http://localhost:5174
```

The dev port is `DEV_SERVER_PORT` from the shell environment (default 5174; a
`.env.local` value is loaded too late to set it). The browser never calls
cms-api: it talks only to this origin (`/bff/v1/*`), so the dev server has no
`/api` proxy. The Next server reaches cms-api through `API_INTERNAL_URL`.

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

- `src/configs/Browser.env.ts` reads `NEXT_PUBLIC_*` keys. They are inlined into
  the browser bundle at build time (so they are public, never secrets) and a
  missing `NEXT_PUBLIC_TURNSTILE_SITE_KEY` fails the build. No cms-api URL is
  ever baked into the bundle.
- `src/configs/Server.env.ts` (`server-only`) reads `API_INTERNAL_URL`,
  `WEB_REVALIDATE_SECONDS`, `WEB_STATUS_PAGE_ENABLED` and the BFF keys (`WEB_ORIGIN`,
  `WEB_SESSION_SECRET`, `TURNSTILE_SECRET_KEY`, `TURNSTILE_EXPECTED_HOSTNAME`, `TRUST_PROXY_HOPS`,
  `CLIENT_IP_HEADER`) at runtime. An invalid value stops the server at
  start (`src/instrumentation.ts`). It is not run during `next build`.
- Every key is documented in [`.env.example`](.env.example).
- `src/configs/endpoints.ts` is the single map of API paths.
- `src/configs/Copy.constants.ts` holds user-facing text until an i18n module
  exists.
- `configs/**` may use pure helpers (`StripTrailingSlashes`,
  `SafeLinkTarget`) but never `apis/client/Api.client` or a feature (ESLint). Error
  codes live with their feature constants (`Auth.constants`,
  `Reviewer.constants`); third-party origins in `Security.constants`.
- `src/utils/SafeLinkTarget.rules.ts` decides what may be an `href` (http(s) URL or
  same-origin path); `optionalLinkTarget` in `RequireEnv.rules.ts` uses it.
- `features/reviewer/Reviewer.queries.ts` owns the reviewer API instance, the
  query key and `useReviewerEnabled()` (anonymous visitor plus Turnstile site
  key only).
- `src/apis/server/graphql/Graphql.server.ts` (`server-only`) is the one way a Server Component
  reads content: `fetchGraphql(document, variables)` posts to
  `${API_INTERNAL_URL}/graphql` with JSON headers only (no `Authorization`, no
  cookie, no client IP), so the page holds what the `public` role may read.
  Caching uses the fetch data cache, `next: { revalidate: WEB_REVALIDATE_SECONDS }`
  (Next 16 without Cache Components; 0 turns it off). Any failure throws one
  `GraphqlRequestError` (`GraphqlResponse.rules.ts`) with the first error code,
  never the server message or the variables.
- `src/apis/client/Graphql.client.ts`: `requestGraphql(document, variables, accessToken)`
  for the browser, over the Axios instance, with the Bearer token from
  `useWebSession`. Same error type.
- `src/utils/SafeRichtext.rules.ts`: `sanitizeRichtext(html)` (DOMPurify; browser
  and tests). Its allowlist mirrors the cms-api storage sanitizer (D13): palette colour on `span`, alignment on `p`/`h1`-`h6`, and `img` only from `CLOUDINARY_IMAGE_ORIGIN` with a UUID `data-media-id`; the palette and alignments are pinned in `PublicConstants.contract.test.ts`. On the
  server use `SafeRichtext.server.ts` (`sanitizeRichtextOnServer`, DOMPurify over
  jsdom), a separate file so jsdom never reaches a client chunk.
- `src/apis/client/Api.client.ts` is the browser Axios instance. It strips trailing
  slashes from every request path (SPEC §6), so no proxy can answer with a
  redirect.

Styling: Tailwind v4 through `@tailwindcss/postcss` with the form-commons theme
(`src/assets/styles/global.css`, the only stylesheet `src/app/layout.tsx` imports; it pulls in `base.css` and `app.css`). Components use semantic
tokens only (`bg-card`, `text-muted-foreground`).

## Sign-in and session

- The header "Sign in" opens `WebLoginDialog` (email + password, then the 2FA
  code when the account has it). Calls go from the browser to this origin's
  BFF (`/bff/v1/auth/*`); the BFF talks to cms-api and keeps the tokens in
  sealed cookies.
- `features/session` owns the session: `useWebSession` and `WebSessionProvider`
  (mounted in `src/components/layouts/AppProviders.tsx`), the auth API and the one
  `PrivilegedAccessError`. `features/auth` (sign-in dialog) and
  `features/reviewer` build on it and never import each other; `components/layouts/AccountMenu`
  composes them. Lint bans deep imports between features and test fixtures in
  production code; `src/FeatureTiers.architecture.test.ts` fails on a directory cycle. The
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
- The CV page (`useCvContent`) refetches its GraphQL document with the
  account's Bearer token after sign-in; a reviewer session does the same.

## Reviewer access

- The header shows "Reviewer access" to anonymous visitors when cms-api's
  public `GET /reviewer/status` says the owner switched it on **and**
  `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set (build-time, public, optional). While
  cms-api's `REVIEWER_FEATURE_ENABLED` is off, that call answers
  `404 REVIEWER_FEATURE_OFF`, which reads as "not enabled" (button hidden).
- `ReviewerAccessDialog` (client component, form-commons + react-hook-form) has
  three steps: role (Recruiter, Peer / colleague, Other), purposes (Hiring,
  Project scoping, Networking, Other) and notes + Turnstile. No personal data
  is asked. `POST /reviewer/sessions` goes from the browser; the 24 h access
  token is held by `useWebSession` in memory (`kind: 'reviewer'`), never in
  storage and never sent to the Next server. There is no refresh cookie, so a
  reload ends the review; "End review" drops the token locally. The dialog
  only handles step navigation and submit; each step is its own component
  (`RoleStep`, `PurposesStep`, `NotesStep`), form values and `toSessionInput`
  live in `Reviewer.form.ts`, and `useHumanCheck.tsx` owns the Turnstile token.
- Turnstile loads through `next/script` only while the dialog's last step is
  open (`challenges.cloudflare.com`, constant `TURNSTILE` in
  `src/configs/Security.constants.ts`). The CSP allows that origin in
  `script-src` and `frame-src`; `next/script` stamps the request nonce on it.
- The CV page refetches with the reviewer token (`useCvContent`), so the
  reviewer sees the reviewer profile's masking.

## Docker

```bash
docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_TURNSTILE_SITE_KEY=<site key> -t abyss-web .
docker run -e API_INTERNAL_URL=http://cms-api:3000/api/v1 -p 8080:8080 abyss-web
```

Multi-stage: `turbo prune`, a frozen install, `turbo run build`, then the
standalone server (`.next/standalone`, `.next/static`, `public/`) on Node as
the non-root `node` user. The build fails without `NEXT_PUBLIC_TURNSTILE_SITE_KEY`; `NEXT_PUBLIC_ADMIN_URL` is an optional build arg.
Runtime env: `API_INTERNAL_URL`, `WEB_REVALIDATE_SECONDS`, `WEB_STATUS_PAGE_ENABLED`,
`WEB_ORIGIN`, `WEB_SESSION_SECRET`, `TURNSTILE_SECRET_KEY` (required), `TURNSTILE_EXPECTED_HOSTNAME`, `TRUST_PROXY_HOPS`, `CLIENT_IP_HEADER`
(`/status` is served only when `true`), `WEB_PORT` (default 8080). `HEALTHCHECK` requests `/`. Telemetry is off (`NEXT_TELEMETRY_DISABLED=1`).

## Scripts

| Script      | What it does                                                                                |
| ----------- | ------------------------------------------------------------------------------------------- |
| `dev`       | Next dev server (Turbopack)                                                                 |
| `build`     | Production build into `.next/` (standalone output)                                          |
| `start`     | Next production server on `WEB_PORT`                                                        |
| `test`      | Vitest + Testing Library (jsdom)                                                            |
| `lint`      | Oxlint (base-config + react, jsx-a11y, vitest) then ESLint (base-config, react-hooks, Next) |
| `typecheck` | `next typegen`, then `tsc --noEmit`                                                         |

The `abyss/file-names` ESLint rule (ADR 0008, run by `pnpm lint`) fails on a file or folder under `src/` and `test/` that breaks the naming rule. Next.js framework files (`page.tsx`, `layout.tsx`, `proxy.ts`, ...) and route-segment folders (`[slug]`, `(group)`, `@slot`) are allowed; the Next.js names are `frameworkFileNames` in `eslint.config.mjs`.

## Security headers (SPEC D17)

- `src/proxy.ts` makes a fresh nonce per request and sets
  `Content-Security-Policy` on the forwarded request (Next.js stamps the nonce
  on its scripts) and on the response. The policy is built in
  `src/utils/ContentSecurityPolicy.rules.ts`: `script-src 'self' 'nonce-<n>'
'strict-dynamic'` + the Turnstile origin, `style-src 'self' 'nonce-<n>'` with
  `style-src-attr 'unsafe-inline'`, `connect-src 'self'` (plus
  `ws:` in dev), `img-src` with Cloudinary,
  `frame-src` Turnstile, `frame-ancestors 'none'`. Dev adds `'unsafe-eval'` and
  `ws:`. Origins and header values are constants in `src/configs/security*.ts`.
- Radix dialogs inject a scroll-lock `<style>` through react-remove-scroll-bar;
  `components/layouts/CspNonce.tsx` passes it the request nonce (`get-nonce` `setNonce`) so
  `style-src` stays nonce-only.
- `next.config.ts` adds HSTS, `nosniff`, `Referrer-Policy`, `Cross-Origin-Opener-Policy: same-origin`, a deny-all `Permissions-Policy` and `X-Frame-Options: DENY` to every route.
- The proxy matcher skips `/bff/`, `/_next/static`, `/_next/image` and
  prefetches. The root layout awaits `connection()`, so every page renders per
  request (the server data cache from `WEB_REVALIDATE_SECONDS` still applies).
- `scripts/smoke.sh` asserts the headers, the nonce match and a fresh nonce
  per response.
